import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createCheckoutLink, InfinitePayError } from "@/lib/infinitepay/client";
import { PLAN, PLAN_PRICE_CENTS } from "@/lib/plans";
import { serviceRoleClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/analytics/events";
import { currentPrice } from "@/lib/settings";
import { baseUrlFromRequest } from "@/lib/site-url";
import {
  attributionToOrderColumns,
  hasAttribution,
  sanitizeAttribution,
} from "@/lib/tracking/attribution";

/**
 * POST /api/checkout
 *
 * Starts a subscription purchase:
 *   1. Mint an order_nsu and record a pending order, so both the webhook
 *      and the success page can resolve it later.
 *   2. Ask InfinitePay for a hosted payment link.
 *   3. Return the URL for the browser to navigate to.
 *
 * No authentication required — buying is how you get a credential in the
 * first place. Each call creates one pending order row; they're harmless
 * (no code is issued until payment is confirmed).
 */

/**
 * Campaign parameters the browser collected on the visitor's first page view.
 *
 * Optional and untrusted: the body is fully caller-controlled, so it is passed
 * through `sanitizeAttribution` (known keys only, truncated, control
 * characters removed) before it goes anywhere near the database. A malformed
 * or absent body must never stop someone from buying, so every failure here
 * degrades to "no attribution".
 */
async function readAttribution(req: NextRequest) {
  try {
    const body = (await req.json()) as unknown;
    if (!body || typeof body !== "object") return {};
    return sanitizeAttribution(
      (body as { attribution?: unknown }).attribution ?? body,
    );
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const orderNsu = `apostai_${randomUUID()}`;
  const base = baseUrlFromRequest(req);
  const attribution = await readAttribution(req);

  // Price comes from the settings, so whatever the promo banner advertises is
  // exactly what gets charged.
  const { cents, promo } = await currentPrice();

  // This request IS the pay-button click, so it's the funnel's first step.
  await logEvent({
    type: "checkout_click",
    orderNsu,
    amountCents: cents,
    detail: promo ? "promo 1º mês" : null,
  });

  try {
    const sb = serviceRoleClient();
    const { error: insertError } = await sb.from("checkout_orders").insert({
      order_nsu: orderNsu,
      amount_cents: cents,
      status: "pending",
      paid_at: null,
      transaction_nsu: null,
      capture_method: null,
      receipt_url: null,
      access_code: null,
      // Stored on the order itself so a confirmed payment can be attributed
      // back to the campaign that produced it, weeks later, without relying
      // on the visitor's browser still being around.
      ...attributionToOrderColumns(attribution),
    });
    if (insertError) throw new Error(insertError.message);

    const url = await createCheckoutLink({
      orderNsu,
      items: [
        {
          description: promo
            ? `${PLAN.checkoutItemName} (promoção 1º mês)`
            : PLAN.checkoutItemName,
          price: cents,
          quantity: 1,
        },
      ],
      redirectUrl: `${base}/assinatura/sucesso`,
      webhookUrl: `${base}/api/webhooks/infinitepay`,
    });

    await logEvent({
      type: "checkout_created",
      orderNsu,
      amountCents: cents,
      ok: true,
      detail: promo ? "promo 1º mês" : null,
      meta: hasAttribution(attribution)
        ? { attribution: attribution as unknown }
        : null,
    });

    // amountCents goes back so the browser can report InitiateCheckout with
    // the price actually charged, instead of a number hardcoded in the UI.
    return NextResponse.json({ url, orderNsu, amountCents: cents });
  } catch (err) {
    if (err instanceof InfinitePayError) {
      console.error(
        `[checkout] InfinitePay ${err.status} (${err.code ?? "-"}): ${err.message}`,
      );
      await logEvent({
        type: "checkout_failed",
        orderNsu,
        ok: false,
        detail: `InfinitePay ${err.status}: ${err.message}`,
      });
      // 502: the failure is upstream, not the customer's fault.
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    console.error("[checkout] failed:", err);
    await logEvent({
      type: "checkout_failed",
      orderNsu,
      ok: false,
      detail: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
