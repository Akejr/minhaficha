import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createCheckoutLink, InfinitePayError } from "@/lib/infinitepay/client";
import { PLAN, PLAN_PRICE_CENTS } from "@/lib/plans";
import { serviceRoleClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/analytics/events";
import { currentPrice } from "@/lib/settings";

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
 * Absolute base URL for redirect/webhook callbacks.
 *
 * InfinitePay calls these from the outside, so localhost is useless in
 * development — the webhook simply won't arrive and the success page falls
 * back to payment_check. Set NEXT_PUBLIC_SITE_URL in production.
 */
function baseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:8080";
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const orderNsu = `apostai_${randomUUID()}`;
  const base = baseUrl(req);

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
    });

    return NextResponse.json({ url, orderNsu });
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
