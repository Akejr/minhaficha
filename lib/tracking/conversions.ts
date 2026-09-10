import { serviceRoleClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/analytics/events";
import { sendPurchase } from "./meta-capi";
import { sanitizeAttribution, type Attribution } from "./attribution";

/**
 * Conversion reporting with an exactly-once guarantee. SERVER ONLY.
 *
 * The problem this solves: a paid order can be confirmed from more than one
 * place. The InfinitePay webhook usually gets there first, but the success page
 * confirms independently when the webhook is late — that fallback is what
 * rescued a real customer once — and a payment can also be reconciled by hand
 * with scripts/issue-code-for-order.ts. Any of them may run twice.
 *
 * So "send Purchase from the webhook" is not enough: it would miss every sale
 * the success page confirmed first. Instead every path calls
 * `reportPurchaseForOrder`, and the database decides who actually sends.
 *
 * The mechanism is an INSERT into `conversion_events`, which carries a unique
 * index on (destination, event_id). Winning the insert is the right to send.
 * Losing it means somebody else already has, so we stop. No locks, no
 * in-memory state, works across serverless instances.
 *
 * HARD RULE: nothing here throws. It is called from the payment path, and a
 * marketing failure must never cost a customer their access code.
 */

type Destination = "meta_capi" | "google_ads";

/** Postgres unique_violation — the signal that another path claimed this. */
const UNIQUE_VIOLATION = "23505";

export type PurchaseReportResult =
  | { status: "sent"; detail: string }
  | { status: "skipped"; detail: string }
  | { status: "failed"; detail: string };

/** Stable id shared with Meta and Google so both can dedupe on their side. */
export function purchaseEventId(orderNsu: string): string {
  return `purchase_${orderNsu}`;
}

/**
 * Try to become the sender for this event.
 *
 * Returns the row id when we won the claim, or null when the event was already
 * claimed (or the table is missing because migration 005 hasn't run — in which
 * case we deliberately do NOT send, since without the ledger we cannot promise
 * exactly-once).
 */
async function claim(
  destination: Destination,
  eventId: string,
  eventName: string,
  orderNsu: string,
  amountCents: number,
): Promise<number | null> {
  try {
    const { data, error } = await serviceRoleClient()
      .from("conversion_events")
      .insert({
        event_id: eventId,
        destination,
        event_name: eventName,
        order_nsu: orderNsu,
        amount_cents: amountCents,
        status: "pending",
        attempts: 1,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return null;
      console.warn(
        `[conversions] não foi possível reservar ${eventId}: ${error.message}`,
      );
      return null;
    }
    return (data as { id: number }).id;
  } catch (err) {
    console.warn(`[conversions] reserva de ${eventId} falhou:`, err);
    return null;
  }
}

async function settle(
  rowId: number,
  ok: boolean,
  detail: string,
): Promise<void> {
  try {
    await serviceRoleClient()
      .from("conversion_events")
      .update({
        status: ok ? "sent" : "failed",
        sent_at: ok ? new Date().toISOString() : null,
        detail: detail.slice(0, 500),
      })
      .eq("id", rowId);
  } catch (err) {
    console.warn(`[conversions] não foi possível atualizar ${rowId}:`, err);
  }
}

/** Pull the attribution we stored when the order was created. */
function attributionFromOrder(order: Record<string, unknown>): Attribution {
  return sanitizeAttribution({
    utm_source: order.utm_source,
    utm_medium: order.utm_medium,
    utm_campaign: order.utm_campaign,
    utm_content: order.utm_content,
    utm_term: order.utm_term,
    fbclid: order.fbclid,
    gclid: order.gclid,
    gbraid: order.gbraid,
    wbraid: order.wbraid,
    fbp: order.fbp,
    fbc: order.fbc,
    landing_path: order.landing_path,
  });
}

/**
 * Report a confirmed purchase to Meta, exactly once.
 *
 * Call this from anywhere a payment is confirmed. It is safe to call
 * repeatedly, concurrently, and from different processes.
 *
 * `amountCents` is not a parameter on purpose: the value reported to the ad
 * platform is read from the order row, which holds what was actually charged.
 * Passing it in would let a caller report a number that was never billed, and
 * a wrong value silently corrupts campaign optimisation.
 */
export async function reportPurchaseForOrder(args: {
  orderNsu: string;
  eventSourceUrl: string;
  userAgent?: string | null;
  clientIp?: string | null;
  /** Where the confirmation came from — for the audit trail. */
  source: "webhook" | "success_page" | "manual";
  /**
   * Cap on the outbound call. The webhook passes a short one: InfinitePay
   * expects a fast answer, and a slow response there means a retry, not a
   * lost pixel.
   */
  timeoutMs?: number;
}): Promise<PurchaseReportResult> {
  const { orderNsu, eventSourceUrl, source } = args;

  try {
    const sb = serviceRoleClient();
    const { data: order, error } = await sb
      .from("checkout_orders")
      .select("*")
      .eq("order_nsu", orderNsu)
      .maybeSingle();

    if (error || !order) {
      return { status: "failed", detail: "pedido não encontrado" };
    }

    const row = order as Record<string, unknown>;

    // Refuse to report anything the database doesn't consider paid. This is
    // the guard that keeps a hand-crafted success-page URL from reporting a
    // conversion.
    if (row.status !== "paid") {
      return { status: "skipped", detail: `pedido em status ${row.status}` };
    }

    const amountCents =
      typeof row.amount_cents === "number" ? row.amount_cents : 0;
    if (amountCents <= 0) {
      return { status: "failed", detail: "pedido sem valor" };
    }

    const eventId = purchaseEventId(orderNsu);
    const rowId = await claim(
      "meta_capi",
      eventId,
      "Purchase",
      orderNsu,
      amountCents,
    );
    if (rowId === null) {
      // Normal and expected on a webhook retry.
      return { status: "skipped", detail: "já reportado" };
    }

    const result = await sendPurchase({
      orderNsu,
      amountCents,
      eventId,
      eventSourceUrl,
      attribution: attributionFromOrder(row),
      userAgent: args.userAgent ?? null,
      clientIp: args.clientIp ?? null,
      timeoutMs: args.timeoutMs,
    });

    await settle(rowId, result.ok, `${source} · ${result.detail}`);

    // Mirror into the internal event log so /admin shows marketing delivery
    // next to the payment it belongs to.
    await logEvent({
      type: result.ok ? "conversion_sent" : "conversion_failed",
      orderNsu,
      amountCents,
      ok: result.ok,
      detail: `Meta CAPI Purchase · ${source} · ${result.detail}`,
      captureRequest: false,
    });

    return result.ok
      ? { status: "sent", detail: result.detail }
      : { status: "failed", detail: result.detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[conversions] Purchase ${orderNsu} falhou: ${message}`);
    return { status: "failed", detail: message };
  }
}

/**
 * Google Ads configuration for the browser.
 *
 * The purchase conversion is fired client-side from the success page (that is
 * how Google Ads conversions work), but only after the server confirmed the
 * order is paid. Returns "" when unconfigured, which makes the tracker a
 * no-op.
 */
export function googlePurchaseSendTo(): string {
  const id = process.env.GOOGLE_ADS_CONVERSION_ID?.trim();
  const label = process.env.GOOGLE_ADS_PURCHASE_LABEL?.trim();
  if (!id || !label) return "";
  return `${id}/${label}`;
}
