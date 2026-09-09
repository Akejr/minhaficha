/**
 * Issue an access code for an order you have CONFIRMED as paid by hand
 * (InfinitePay email or the sale list in the app).
 *
 * Needed because `payment_check` cannot be used to verify older payments: it
 * stops recognising a transaction after a while, returning {"success": false}
 * even for a sale that definitely settled. So when the webhook was never
 * delivered, the only source of truth is the InfinitePay record you can see.
 *
 * Idempotent: an order that already has a code just prints it again.
 *
 *   npx tsx scripts/issue-code-for-order.ts <order_nsu> --confirmed
 *   npx tsx scripts/issue-code-for-order.ts <order_nsu> --confirmed --lifetime
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const args = process.argv.slice(2);
const orderNsu = args.find((a) => !a.startsWith("--"));
const confirmed = args.includes("--confirmed");
const lifetime = args.includes("--lifetime");

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
const CODE_LENGTH = 12;
const VALIDITY_DAYS = 30;

function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

function pretty(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

async function main() {
  if (!orderNsu) {
    console.error(
      "Uso: npx tsx scripts/issue-code-for-order.ts <order_nsu> --confirmed",
    );
    process.exit(1);
  }
  if (!confirmed) {
    console.error(
      "Falta --confirmed. Só use depois de confirmar o pagamento na InfinitePay:\n" +
        "isto marca o pedido como pago sem consultar a API.",
    );
    process.exit(1);
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: order, error } = await sb
    .from("checkout_orders")
    .select("*")
    .eq("order_nsu", orderNsu)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) {
    console.error(`Pedido não encontrado: ${orderNsu}`);
    process.exit(1);
  }

  console.log(
    `Pedido ${orderNsu}\n  valor: R$ ${(order.amount_cents / 100).toFixed(2)}\n  status atual: ${order.status}`,
  );

  const { data: existing } = await sb
    .from("access_codes")
    .select("code, expires_at")
    .eq("order_nsu", orderNsu)
    .maybeSingle();

  if (existing?.code) {
    console.log(`\nJá havia um código para este pedido: ${pretty(existing.code)}`);
    return;
  }

  const code = generateCode();
  const expiresAt = lifetime
    ? null
    : new Date(Date.now() + VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: insErr } = await sb.from("access_codes").insert({
    code,
    expires_at: expiresAt,
    is_permanent: lifetime,
    kind: lifetime ? "lifetime" : "monthly",
    source: "checkout",
    order_nsu: orderNsu,
    transaction_nsu: order.transaction_nsu,
    amount_cents: order.amount_cents,
    note: "emitido manualmente — webhook não chegou (NEXT_PUBLIC_SITE_URL errada)",
    last_used_at: null,
    revoked_at: null,
  });
  if (insErr) throw new Error(insErr.message);

  await sb
    .from("checkout_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      access_code: code,
    })
    .eq("order_nsu", orderNsu);

  await sb.from("events").insert({
    type: "payment_confirmed",
    code,
    order_nsu: orderNsu,
    amount_cents: order.amount_cents,
    ok: true,
    detail: "emissão manual (confirmado por email)",
  } as never);

  console.log(`\n>>> CÓDIGO: ${pretty(code)}`);
  console.log(`    (digite sem os tracinhos: ${code})`);
  console.log(
    `    validade: ${expiresAt ? new Date(expiresAt).toLocaleString("pt-BR") : "não expira"}`,
  );
  console.log("\nEnvie este código ao cliente.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
