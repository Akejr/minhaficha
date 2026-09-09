/**
 * Emergency diagnostic: a customer paid but received no code.
 * Read-only. Temporary — delete after use.
 *
 *   npx tsx scripts/diagnose-payment.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const brl = (c: number | null) =>
  c == null ? "—" : `R$ ${(c / 100).toFixed(2)}`;
const when = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR") : "—";

async function main() {
  console.log("======== CONFIG ========");
  console.log("NEXT_PUBLIC_SITE_URL :", process.env.NEXT_PUBLIC_SITE_URL ?? "(não definido)");
  console.log("INFINITEPAY_HANDLE   :", process.env.INFINITEPAY_HANDLE ?? "(não definido)");
  console.log("WEBHOOK_VERIFY       :", process.env.INFINITEPAY_WEBHOOK_VERIFY ?? "(padrão: ligado)");

  console.log("\n======== PROMO ========");
  const { data: setting, error: setErr } = await sb
    .from("app_settings")
    .select("*")
    .eq("key", "promo_first_month")
    .maybeSingle();
  if (setErr) console.log("  ERRO (migration-004 aplicada?):", setErr.message);
  else console.log(" ", JSON.stringify(setting?.value ?? null), "atualizado", when(setting?.updated_at ?? null));

  console.log("\n======== PEDIDOS (10 mais recentes) ========");
  const { data: orders, error: ordErr } = await sb
    .from("checkout_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  if (ordErr) console.log("  ERRO:", ordErr.message);
  for (const o of orders ?? []) {
    console.log(
      `  [${o.status.toUpperCase().padEnd(7)}] ${brl(o.amount_cents).padEnd(10)} criado ${when(o.created_at)}`,
    );
    console.log(`      order_nsu : ${o.order_nsu}`);
    console.log(`      pago em   : ${when(o.paid_at)}`);
    console.log(`      tx_nsu    : ${o.transaction_nsu ?? "—"}`);
    console.log(`      metodo    : ${o.capture_method ?? "—"}`);
    console.log(`      codigo    : ${o.access_code ?? "NENHUM"}`);
  }
  if (!orders?.length) console.log("  (nenhum pedido)");

  console.log("\n======== CODIGOS (10 mais recentes) ========");
  const { data: codes } = await sb
    .from("access_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  for (const c of codes ?? []) {
    console.log(
      `  ${c.code.padEnd(14)} ${String(c.kind).padEnd(9)} ${String(c.source).padEnd(9)} criado ${when(c.created_at)} expira ${when(c.expires_at)} revogado=${c.revoked_at ? "SIM" : "no"}`,
    );
  }

  console.log("\n======== EVENTOS DE PAGAMENTO / ACESSO (30) ========");
  const { data: evs, error: evErr } = await sb
    .from("events")
    .select("*")
    .in("type", [
      "checkout_click",
      "checkout_created",
      "checkout_failed",
      "payment_confirmed",
      "payment_unconfirmed",
      "payment_underpaid",
      "login_failed",
      "login_success",
    ])
    .order("id", { ascending: false })
    .limit(30);
  if (evErr) console.log("  ERRO:", evErr.message);
  for (const e of evs ?? []) {
    console.log(
      `  ${when(e.created_at)}  ${String(e.type).padEnd(20)} ${brl(e.amount_cents).padEnd(10)} ${e.detail ?? ""}`,
    );
    if (e.order_nsu) console.log(`      order: ${e.order_nsu}`);
  }
  if (!evs?.length) console.log("  (nenhum)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
