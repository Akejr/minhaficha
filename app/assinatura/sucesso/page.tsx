import Link from "next/link";
import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";
import { CodeReveal } from "@/components/subscription/CodeReveal";
import { whatsappLink } from "@/lib/whatsapp";
import { issueCodeForOrder, CODE_VALIDITY_DAYS } from "@/lib/access/codes";
import { amountCovers, checkPayment } from "@/lib/infinitepay/client";
import { serviceRoleClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/analytics/events";

/**
 * Landing page after the InfinitePay checkout.
 *
 * InfinitePay appends order_nsu, transaction_nsu, slug, capture_method and
 * receipt_url to the redirect. Two things can be true when the customer
 * arrives:
 *
 *   a) the webhook already fired → the code exists, just show it;
 *   b) the redirect beat the webhook → we confirm the payment ourselves via
 *      payment_check and issue the code here.
 *
 * Both paths funnel through `issueCodeForOrder`, which is idempotent per
 * order, so the customer can refresh this page as often as they like and
 * always see the same code.
 */

type PageProps = {
  searchParams: {
    order_nsu?: string;
    transaction_nsu?: string;
    slug?: string;
    capture_method?: string;
    receipt_url?: string;
  };
};

type Outcome =
  | { kind: "ok"; code: string; expiresAt: string | null }
  | { kind: "pending" }
  | { kind: "missing" };

async function resolveOutcome(sp: PageProps["searchParams"]): Promise<Outcome> {
  const orderNsu = sp.order_nsu?.trim();
  if (!orderNsu) return { kind: "missing" };

  const sb = serviceRoleClient();

  const { data: order } = await sb
    .from("checkout_orders")
    .select("*")
    .eq("order_nsu", orderNsu)
    .maybeSingle();

  // Unknown order — someone hand-crafted the URL.
  if (!order) return { kind: "missing" };

  // (a) Webhook already did the work.
  if (order.access_code) {
    const { data: codeRow } = await sb
      .from("access_codes")
      .select("expires_at")
      .eq("code", order.access_code)
      .maybeSingle();
    return {
      kind: "ok",
      code: order.access_code,
      expiresAt: codeRow?.expires_at ?? null,
    };
  }

  // (b) Confirm with InfinitePay before issuing anything.
  try {
    const check = await checkPayment({
      transactionNsu: sp.transaction_nsu ?? null,
      orderNsu,
      slug: sp.slug ?? null,
    });
    if (!check.paid) return { kind: "pending" };

    if (!amountCovers(check, order.amount_cents)) {
      console.error(
        `[sucesso] order ${orderNsu} underpaid: settled ${
          check.paidAmountCents ?? check.amountCents
        } < expected ${order.amount_cents}`,
      );
      return { kind: "pending" };
    }

    const code = await issueCodeForOrder({
      orderNsu,
      transactionNsu: sp.transaction_nsu ?? null,
      amountCents: check.paidAmountCents ?? order.amount_cents,
    });

    await sb
      .from("checkout_orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        transaction_nsu: sp.transaction_nsu ?? null,
        capture_method: check.captureMethod ?? sp.capture_method ?? null,
        receipt_url: sp.receipt_url ?? null,
        access_code: code,
      })
      .eq("order_nsu", orderNsu);

    const { data: codeRow } = await sb
      .from("access_codes")
      .select("expires_at")
      .eq("code", code)
      .maybeSingle();

    await logEvent({
      type: "payment_confirmed",
      orderNsu,
      code,
      amountCents: check.paidAmountCents ?? order.amount_cents,
      ok: true,
      detail: `tela de sucesso · ${check.captureMethod ?? "?"}`,
    });

    return { kind: "ok", code, expiresAt: codeRow?.expires_at ?? null };
  } catch (err) {
    console.error(`[sucesso] order ${orderNsu} verification failed:`, err);
    return { kind: "pending" };
  }
}

export default async function SubscriptionSuccessPage({
  searchParams,
}: PageProps) {
  const outcome = await resolveOutcome(searchParams);

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern min-h-screen anim-page-in">
        {outcome.kind === "ok" ? (
          <CodeReveal
            code={outcome.code}
            expiresAt={outcome.expiresAt}
            validityDays={CODE_VALIDITY_DAYS}
          />
        ) : outcome.kind === "pending" ? (
          <PendingCard orderNsu={searchParams.order_nsu ?? ""} />
        ) : (
          <MissingCard />
        )}
      </main>

      <BottomNavBar />
    </>
  );
}

function PendingCard({ orderNsu }: { orderNsu: string }) {
  return (
    <section className="flex flex-col items-center text-center pt-4">
      <div className="w-20 h-20 rounded-3xl bg-surface-container border border-white/10 flex items-center justify-center mb-5">
        <span className="material-symbols-outlined text-primary-container text-[36px]">
          hourglass_top
        </span>
      </div>
      <h1 className="font-display-lg text-[26px] leading-tight text-on-surface mb-2 tracking-tight">
        Confirmando o
        <br />
        seu pagamento
      </h1>
      <p className="font-body-md text-[14px] text-on-surface-variant mb-6 max-w-[320px]">
        Ainda não recebemos a confirmação da InfinitePay. Isso costuma levar
        alguns segundos. Atualize esta página para verificar de novo — o seu
        código aparece aqui assim que o pagamento for aprovado.
      </p>

      <Link
        href={`/assinatura/sucesso?order_nsu=${encodeURIComponent(orderNsu)}`}
        className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined text-[18px]">refresh</span>
        Verificar de novo
      </Link>

      {/* Escape hatch. Someone who paid and can't get a code must never be
          left with nothing to click — that stranded a real customer once. */}
      <a
        href={whatsappLink(
          `Olá! Paguei a assinatura do ApostAI e não recebi o código. Meu pedido: ${orderNsu}`,
        )}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 w-full rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-label-md text-label-md py-3.5 flex items-center justify-center gap-2 hover:bg-emerald-500/15 transition-colors"
      >
        Já paguei — falar no WhatsApp
      </a>

      <p className="mt-4 font-body-md text-[11px] text-on-surface-variant/60 break-all">
        Guarde este número do pedido: {orderNsu || "—"}
      </p>
    </section>
  );
}

function MissingCard() {
  return (
    <section className="flex flex-col items-center text-center pt-4">
      <div className="w-20 h-20 rounded-3xl bg-surface-container border border-white/10 flex items-center justify-center mb-5">
        <span className="material-symbols-outlined text-error text-[36px]">
          help
        </span>
      </div>
      <h1 className="font-display-lg text-[26px] leading-tight text-on-surface mb-2 tracking-tight">
        Pedido não
        <br />
        encontrado
      </h1>
      <p className="font-body-md text-[14px] text-on-surface-variant mb-6 max-w-[320px]">
        Não localizamos esse pedido. Se você acabou de pagar, volte ao link que
        a InfinitePay mostrou no fim da compra. Se já tem um código, entre com
        ele.
      </p>
      <Link
        href="/entrar"
        className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all flex items-center justify-center gap-2"
      >
        Entrar com código
        <span className="material-symbols-outlined text-[18px]">
          arrow_forward
        </span>
      </Link>

      <a
        href={whatsappLink(
          "Olá! Paguei a assinatura do ApostAI e não recebi o código de acesso.",
        )}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 font-label-md text-label-md text-emerald-300 hover:opacity-80 transition-opacity"
      >
        Paguei e não recebi o código
      </a>
      <Link
        href="/"
        className="mt-3 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
      >
        Voltar ao início
      </Link>
    </section>
  );
}

// Reads query params and hits the database — never prerender.
export const dynamic = "force-dynamic";
