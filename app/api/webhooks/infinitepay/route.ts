import { NextResponse, type NextRequest } from "next/server";
import { issueCodeForOrder } from "@/lib/access/codes";
import { amountCovers, checkPayment } from "@/lib/infinitepay/client";
import { serviceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/webhooks/infinitepay
 *
 * InfinitePay calls this once a payment is approved. Per their docs we must
 * answer fast (target: under a second) with 200 on success or 400 to ask for
 * a retry.
 *
 * What we do:
 *   1. Read order_nsu from the payload.
 *   2. Match it against a pending order we created in /api/checkout. An
 *      unknown order_nsu is rejected — the docs explicitly warn to validate
 *      that it maps to a real order.
 *   3. Confirm the payment against InfinitePay rather than trusting the
 *      request body. This endpoint is public and unsigned, so a forged POST
 *      would otherwise mint free access codes.
 *   4. Issue the 12-character code (idempotent per order) and mark the
 *      order paid.
 *
 * Returning 400 on transient failures is intentional: it makes InfinitePay
 * retry, which is exactly what we want if our database blipped.
 */

/**
 * Set INFINITEPAY_WEBHOOK_VERIFY=false only if you are testing without
 * network access to InfinitePay. Leaving verification on is what stops a
 * forged webhook from granting access.
 */
function verificationEnabled(): boolean {
  return process.env.INFINITEPAY_WEBHOOK_VERIFY !== "false";
}

function pickString(obj: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    console.warn("[webhook] non-JSON body");
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // The payload has been documented with both flat and nested shapes; look
  // in the obvious places before giving up.
  const nested =
    (body.data as Record<string, unknown> | undefined) ??
    (body.transaction as Record<string, unknown> | undefined) ??
    {};
  const merged: Record<string, unknown> = { ...nested, ...body };

  const orderNsu = pickString(merged, "order_nsu", "external_order_id");
  const transactionNsu = pickString(merged, "transaction_nsu", "nsu");
  const slug = pickString(merged, "slug", "invoice_slug");
  const captureMethod = pickString(merged, "capture_method", "payment_method");
  const receiptUrl = pickString(merged, "receipt_url");
  const amountRaw = merged.amount ?? merged.paid_amount ?? merged.value;
  const amountCents =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string" && amountRaw.trim() !== ""
        ? Number(amountRaw)
        : null;

  if (!orderNsu) {
    console.warn("[webhook] payload without order_nsu:", Object.keys(merged));
    return NextResponse.json({ error: "order_nsu missing" }, { status: 400 });
  }

  try {
    const sb = serviceRoleClient();

    // Step 2 — the order must be one we created.
    const { data: order } = await sb
      .from("checkout_orders")
      .select("*")
      .eq("order_nsu", orderNsu)
      .maybeSingle();

    if (!order) {
      // Not retryable: we will never recognise this order. 200 stops the
      // retry loop for what is either a stale or a forged notification.
      console.warn(`[webhook] unknown order_nsu ${orderNsu} — ignoring`);
      return NextResponse.json({ ignored: true }, { status: 200 });
    }

    // Already processed → return the same result. Idempotency matters
    // because retries are expected.
    if (order.status === "paid" && order.access_code) {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }

    // Step 3 — verify against InfinitePay instead of trusting the body.
    if (verificationEnabled()) {
      const check = await checkPayment({
        transactionNsu: transactionNsu,
        orderNsu,
        slug,
      });
      if (!check.paid) {
        console.warn(
          `[webhook] order ${orderNsu} not confirmed as paid — refusing to issue code`,
        );
        // 400 so InfinitePay retries: the payment may settle moments later.
        return NextResponse.json({ error: "not confirmed" }, { status: 400 });
      }
      if (!amountCovers(check, order.amount_cents)) {
        // Underpaid: do NOT retry, and do NOT grant access.
        console.error(
          `[webhook] order ${orderNsu} underpaid: settled ${
            check.paidAmountCents ?? check.amountCents
          } < expected ${order.amount_cents}`,
        );
        return NextResponse.json({ error: "amount mismatch" }, { status: 200 });
      }
    }

    // Step 4 — issue the code and close out the order.
    const code = await issueCodeForOrder({
      orderNsu,
      transactionNsu,
      amountCents: amountCents ?? order.amount_cents,
    });

    const { error: updateError } = await sb
      .from("checkout_orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        transaction_nsu: transactionNsu,
        capture_method: captureMethod,
        receipt_url: receiptUrl,
        access_code: code,
      })
      .eq("order_nsu", orderNsu);
    if (updateError) throw new Error(updateError.message);

    console.log(`[webhook] order ${orderNsu} paid — code issued`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[webhook] order ${orderNsu} failed:`, err);
    // 400 → InfinitePay retries.
    return NextResponse.json({ error: "processing failed" }, { status: 400 });
  }
}
