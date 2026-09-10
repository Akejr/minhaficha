import type { Metadata } from "next";
import Link from "next/link";
import { FreeFixtureCard } from "@/components/FreeFixtureCard";
import { SubscribeButton } from "@/components/subscription/SubscribeButton";
import { SubscriptionOfferTracker } from "@/components/tracking/FunnelTrackers";
import {
  fetchPopularFixtures,
  type PopularFixture,
} from "@/lib/api-football/popular";
import { formatCents } from "@/lib/plans";
import { priceView } from "@/lib/settings";

/**
 * /gratis — the three free analyses, and nothing else.
 *
 * Built as a direct ad destination. Where /start argues the case (proof, how it
 * works, FAQ), this page assumes the ad already did the arguing and puts the
 * product one tap away. No scrolling required to reach the thing being
 * advertised.
 *
 * Deliberately minimal: no proof section, no FAQ, no anchors. The only actions
 * are opening an analysis and, further down, subscribing. Everything shown is
 * real — same fixture list the app unlocks, same price the checkout charges.
 */

export const metadata: Metadata = {
  title: "3 análises de futebol grátis hoje — ApostAI",
  description:
    "Veja agora as análises grátis do dia: três níveis de risco, probabilidade estimada e a explicação de cada indicação. Sem cadastro.",
  openGraph: {
    title: "As 3 análises grátis de hoje",
    description:
      "Probabilidade estimada e o motivo de cada indicação. Estimativas, não certezas.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default async function FreeAnalysesPage() {
  const [price, fixtures] = await Promise.all([priceView(), loadFixtures()]);

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.04] blur-[120px] pointer-events-none z-0" />

      <header
        className="fixed left-0 right-0 mx-auto max-w-[440px] z-50 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-6"
        style={{
          top: "var(--promo-height)",
          paddingTop:
            "calc(var(--promo-header-inset, env(safe-area-inset-top, 0px)) + 16px)",
          paddingBottom: 16,
        }}
      >
        <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold bg-gradient-to-r from-primary-container to-secondary-container bg-clip-text text-transparent">
          ApostAI
        </span>
        <Link
          href="/entrar"
          className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Já tenho código
        </Link>
      </header>

      <main className="px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern anim-page-in pb-24 pt-[calc(var(--promo-height)+env(safe-area-inset-top,0px)+80px)]">
        <section className="pt-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-label-md text-[10px] uppercase tracking-wider text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Liberado, sem cadastro
          </span>

          <h1 className="font-display-lg text-[30px] leading-[1.14] tracking-tight text-on-surface mt-4">
            As 3 análises
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-secondary-container">
              grátis de hoje.
            </span>
          </h1>

          <p className="font-body-lg text-[15px] leading-relaxed text-on-surface-variant mt-3">
            Toque em um jogo e veja os três cenários, a probabilidade estimada de
            cada um e o motivo por trás da indicação.
          </p>
        </section>

        <section className="mt-8">
          {fixtures.length === 0 ? (
            <div className="glass-card rounded-xl p-6 text-center">
              <p className="font-body-md text-[13px] text-on-surface-variant">
                Não foi possível carregar as análises agora. Atualize a página em
                alguns instantes.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {fixtures.map((f) => (
                <FreeFixtureCard key={f.fixtureId} fixture={f} />
              ))}
            </div>
          )}

          <p className="mt-4 rounded-xl border border-white/10 bg-surface-container/60 px-4 py-3 font-body-md text-[12px] leading-relaxed text-on-surface-variant">
            <span className="text-on-surface font-semibold">
              Baixo risco não significa garantia.
            </span>{" "}
            Toda análise apresenta estimativas, não certezas.
          </p>
        </section>

        {/* The only other action on the page. Kept compact on purpose: the ad
            paid for someone to read an analysis, and the upgrade makes more
            sense after they have. */}
        <section className="mt-12">
          <div className="glass-card rounded-2xl p-5 border border-primary-container/40">
            <SubscriptionOfferTracker surface="gratis_page" />
            <h2 className="font-headline-md text-[17px] leading-snug text-on-surface">
              Quer analisar outros jogos?
            </h2>
            <p className="font-body-md text-[13px] leading-relaxed text-on-surface-variant mt-1.5">
              Por{" "}
              <span className="text-on-surface font-semibold">
                {formatCents(price.activeCents)}
              </span>
              {price.isPromo && (
                <>
                  {" "}
                  <span className="line-through">
                    {formatCents(price.regularCents)}
                  </span>
                </>
              )}{" "}
              você libera qualquer partida por 30 dias e recebe o código de
              acesso na hora.
            </p>

            <div className="mt-4">
              <SubscribeButton label="Desbloquear acesso" />
            </div>

            <p className="mt-3 text-center font-body-md text-[11px] text-on-surface-variant">
              Pix ou cartão pela InfinitePay · não renova automaticamente
            </p>
          </div>
        </section>

        <section className="mt-12 border-t border-white/10 pt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-label-md text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-error/40 bg-error/10 text-error">
              18+
            </span>
            <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">
              Aposte com responsabilidade
            </span>
          </div>
          <p className="font-body-md text-[11px] leading-relaxed text-on-surface-variant/80">
            A ApostAI é uma ferramenta de análise e não é uma casa de apostas.
            Não aceitamos apostas nem movimentamos dinheiro de jogo.
            Probabilidade não é garantia: nenhuma análise assegura retorno, e
            você pode perder o valor que arriscar. Conteúdo para maiores de 18
            anos. Aposta pode causar dependência — se o jogo deixou de ser
            diversão, procure ajuda.
          </p>
        </section>
      </main>
    </>
  );
}

/** A failed fixture call must not take the page down — show the empty state. */
async function loadFixtures(): Promise<PopularFixture[]> {
  try {
    return await fetchPopularFixtures();
  } catch (err) {
    console.error("[gratis] fixtures unavailable:", err);
    return [];
  }
}

// Live fixture data, so revalidate rather than prerender at build time.
export const revalidate = 300;
