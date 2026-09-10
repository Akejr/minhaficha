import type { Metadata } from "next";
import Link from "next/link";
import { SubscribeButton } from "@/components/subscription/SubscribeButton";
import { PriceTag } from "@/components/subscription/PriceTag";
import { SubscriptionOfferTracker } from "@/components/tracking/FunnelTrackers";
import {
  fetchPopularFixtures,
  type PopularFixture,
} from "@/lib/api-football/popular";
import { teamLogoUrl } from "@/lib/team-logo";
import { formatCents } from "@/lib/plans";
import { priceView, type PriceView } from "@/lib/settings";

/**
 * Ad landing page (/start).
 *
 * Single job: turn a visitor into someone who has read a real analysis, and
 * then into a subscriber. Everything on the page serves that, in that order.
 *
 * Structural rules, deliberate:
 *   - the free fixtures appear immediately after the hero, because the fastest
 *     way to sell an analysis is to let someone read one;
 *   - no navigation menu and no outbound links except "já tenho código", which
 *     exists so a paying customer isn't stranded on this page;
 *   - every number is real. The fixtures come from the live API, the audit
 *     figures from backtest-results/RESUMO-FINAL.md (403 evaluated suggestions
 *     across 187 fixtures and 11 competitions, May 2026). No testimonials, no
 *     countdowns, no fake scarcity, no invented results.
 *
 * Copy rules:
 *   - no jargon. Someone arriving from an ad will not look up "Dixon-Coles",
 *     "backtest", "pipeline" or "calibração";
 *   - never "aposta certa", "lucro garantido" or "acerto garantido". The
 *     product estimates probabilities; claiming certainty is both consumer
 *     deception under the CDC and grounds for an ad account being suspended.
 */

export const metadata: Metadata = {
  title: "ApostAI — analise os jogos antes de tomar sua decisão",
  description:
    "Probabilidades estimadas, três níveis de risco e a explicação de cada análise. 3 jogos grátis por dia, sem cadastro.",
  openGraph: {
    title: "Analise os jogos antes de tomar sua decisão",
    description:
      "Três níveis de risco, probabilidade estimada e o motivo de cada indicação. Estimativas, não certezas.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

/**
 * Internal historical test — see backtest-results/RESUMO-FINAL.md.
 *
 * `said` is the probability the model published, `got` is what actually
 * happened in the evaluated cases. Shown together on purpose: a model whose
 * stated probability matches reality is the only credibility claim we can make
 * honestly, and almost nobody in this market publishes it.
 */
const AUDIT = {
  fixtures: 187,
  suggestions: 403,
  leagues: 11,
  levels: [
    {
      name: "Baixo risco",
      meaning: "O cenário mais provável dos três. É onde acertamos mais.",
      tone: "emerald",
      said: "71,8%",
      got: "74,0%",
      cases: "77 casos",
    },
    {
      name: "Médio risco",
      meaning: "Equilibrado: paga mais que o de baixo risco e sai menos vezes.",
      tone: "amber",
      said: "48,3%",
      got: "45,6%",
      cases: "147 casos",
    },
    {
      name: "Alto risco",
      meaning: "O cenário ousado. Sai poucas vezes, e a gente diz isso na cara.",
      tone: "rose",
      said: "24,5%",
      got: "23,5%",
      cases: "179 casos",
    },
  ],
} as const;

const TONE: Record<string, { dot: string; border: string; text: string }> = {
  emerald: {
    dot: "bg-emerald-400",
    border: "border-emerald-500/30",
    text: "text-emerald-300",
  },
  amber: {
    dot: "bg-amber-400",
    border: "border-amber-500/30",
    text: "text-amber-300",
  },
  rose: {
    dot: "bg-rose-400",
    border: "border-rose-500/30",
    text: "text-rose-300",
  },
};

export default async function StartPage() {
  // Both come from the live system. The price is read rather than hardcoded so
  // the page can never advertise a number the checkout doesn't charge.
  const [price, fixtures] = await Promise.all([
    priceView(),
    loadFreeFixtures(),
  ]);

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.04] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.03] blur-[100px] pointer-events-none z-0" />

      <LandingHeader />

      <main className="px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern anim-page-in pb-24 pt-[calc(var(--promo-height)+env(safe-area-inset-top,0px)+80px)]">
        <Hero />
        <RealAnalysisNow fixtures={fixtures} />
        <RiskPreview />
        <HowItWorks />
        <Credibility />
        <Offer price={price} />
        <Transparency />
        <Faq price={price} />
        <FinalCta />
        <Legal />
      </main>
    </>
  );
}

/** Never let a failed fixture call take the whole landing page down. */
async function loadFreeFixtures(): Promise<PopularFixture[]> {
  try {
    return await fetchPopularFixtures();
  } catch (err) {
    console.error("[start] free fixtures unavailable:", err);
    return [];
  }
}

/**
 * Brand plus one way out, for someone who already paid. Everything else that
 * could pull attention off the page is intentionally absent.
 */
function LandingHeader() {
  return (
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
  );
}

/* ---------------------------------------------------------------- 1. Hero */

function Hero() {
  return (
    <section className="pt-6 text-center">
      <h1 className="font-display-lg text-[32px] leading-[1.12] tracking-tight text-on-surface">
        Analise os jogos antes
        <br />
        de{" "}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-secondary-container">
          tomar sua decisão.
        </span>
      </h1>

      <p className="font-body-lg text-[16px] leading-relaxed text-on-surface-variant mt-4">
        Veja probabilidades estimadas, três níveis de risco e a explicação por
        trás de cada análise.
      </p>

      <div className="mt-7">
        <a
          href="#gratis"
          className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_24px_rgba(255,107,0,0.45)] flex items-center justify-center gap-2 press"
        >
          Ver análises grátis de hoje
          <span className="material-symbols-outlined text-[18px]">
            arrow_downward
          </span>
        </a>
        <p className="mt-3 font-body-md text-[12px] text-on-surface-variant">
          3 jogos grátis por dia • sem cadastro
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------- 2. The offer, consumable now */

/**
 * The page's core move: a real analysis, one tap away, before any price is
 * mentioned. These are the actual free fixtures the app unlocks today — the
 * same list `lib/free-fixtures.ts` uses to grant access, so what is advertised
 * here and what actually opens can never drift apart.
 */
function RealAnalysisNow({ fixtures }: { fixtures: PopularFixture[] }) {
  return (
    <section id="gratis" className="mt-12 scroll-mt-24">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <span className="font-label-md text-[10px] uppercase tracking-[0.18em] text-primary-container">
            Comece por aqui
          </span>
          <h2 className="font-headline-md text-[20px] leading-tight text-on-surface mt-1">
            Veja uma análise real agora
          </h2>
        </div>
        <span className="shrink-0 mt-1 font-label-md text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
          Grátis
        </span>
      </div>

      {fixtures.length === 0 ? (
        <div className="glass-card rounded-xl p-6 text-center">
          <p className="font-body-md text-[13px] text-on-surface-variant">
            Não foi possível carregar os jogos de hoje agora. Atualize a página
            em alguns instantes.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {fixtures.map((f) => (
            <FreeFixtureCard key={f.fixtureId} fixture={f} />
          ))}
        </div>
      )}

      <p className="mt-4 text-center font-body-md text-[12px] text-on-surface-variant">
        A análise abre inteira: os três cenários, a probabilidade estimada de
        cada um e o motivo. Sem cadastro.
      </p>
    </section>
  );
}

function FreeFixtureCard({ fixture }: { fixture: PopularFixture }) {
  return (
    <Link
      href={`/match/${fixture.fixtureId}`}
      // Prefetch MUST stay off. /match/[id] is dynamic, so a prefetch would
      // server-render the whole analysis in the background: it logs a view
      // nobody made and, on a cache miss, spends real API and OpenAI money on
      // a page that was never opened.
      prefetch={false}
      className="glass-card rounded-xl p-5 block hover:border-primary-container/30 transition-colors group press"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <KickoffBadge fixture={fixture} />
        <span className="font-mono-data text-mono-data text-on-surface-variant truncate">
          {fixture.league}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <TeamRow
          name={fixture.home.name}
          logo={fixture.home.logo}
          score={fixture.score?.home}
        />
        <div className="h-px w-full bg-white/5" />
        <TeamRow
          name={fixture.away.name}
          logo={fixture.away.logo}
          score={fixture.score?.away}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-2">
        <span className="font-label-md text-label-md text-primary-container group-hover:opacity-80 transition-opacity">
          Ver análise grátis
        </span>
        <span className="material-symbols-outlined text-primary-container text-[18px]">
          arrow_forward
        </span>
      </div>
    </Link>
  );
}

/**
 * Kickoff time, or the live/finished state.
 *
 * A finished fixture stays in the free set on purpose: the analysis is still
 * readable next to the real score, which is the cheapest honest demonstration
 * that the numbers mean something.
 */
function KickoffBadge({ fixture }: { fixture: PopularFixture }) {
  if (fixture.state === "finished") {
    return (
      <span className="font-label-md text-label-md px-2 py-1 rounded bg-white/5 border border-white/15 text-on-surface-variant truncate">
        Encerrado
      </span>
    );
  }
  if (fixture.state === "live") {
    return (
      <span className="font-label-md text-label-md px-2 py-1 rounded bg-error/10 border border-error/40 text-error truncate inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
        Ao vivo
      </span>
    );
  }
  return (
    <span className="font-label-md text-label-md px-2 py-1 rounded bg-surface-container border border-white/10 text-on-surface-variant truncate">
      Hoje, {fixture.stateLabel}
    </span>
  );
}

function TeamRow({
  name,
  logo,
  score,
}: {
  name: string;
  logo: string;
  score?: number;
}) {
  const proxied = teamLogoUrl(logo);
  return (
    <div className="flex items-center gap-3">
      {proxied ? (
        <div className="w-7 h-7 rounded-full bg-white/95 border border-white/10 flex items-center justify-center p-1 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxied}
            alt={name}
            width={20}
            height={20}
            className="w-5 h-5 object-contain"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-on-surface-variant text-[14px]">
            shield
          </span>
        </div>
      )}
      <span className="font-headline-md text-[16px] text-on-surface truncate flex-1">
        {name}
      </span>
      {score != null && (
        <span className="font-mono-data text-[18px] text-on-surface shrink-0">
          {score}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------- 3. The three scenarios */

/**
 * What the visitor will find inside an analysis.
 *
 * Shows the published probability next to what actually happened, from the
 * internal historical test. Real numbers, and the closeness between the two
 * columns is the whole argument: when the screen says 72%, it happens near
 * 72% — not near 40%.
 */
function RiskPreview() {
  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="O que você vê na análise"
        title="Três cenários, do mais seguro ao mais ousado"
      />

      <div className="flex flex-col gap-3">
        {AUDIT.levels.map((l) => {
          const tone = TONE[l.tone]!;
          return (
            <article
              key={l.name}
              className={`glass-card rounded-xl p-5 border ${tone.border}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                <h3
                  className={`font-headline-md text-[15px] ${tone.text} flex-1`}
                >
                  {l.name}
                </h3>
              </div>
              <p className="font-body-md text-[13px] leading-relaxed text-on-surface-variant">
                {l.meaning}
              </p>

              <div className="mt-4 flex items-center gap-4 pt-3 border-t border-white/5">
                <div className="min-w-0">
                  <p className="font-label-md text-[9px] uppercase tracking-wider text-on-surface-variant/70">
                    Dissemos
                  </p>
                  <p className="font-mono-data text-[15px] text-on-surface-variant mt-0.5">
                    {l.said}
                  </p>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant/40 text-[18px]">
                  arrow_forward
                </span>
                <div className="min-w-0">
                  <p className="font-label-md text-[9px] uppercase tracking-wider text-primary-container">
                    Aconteceu
                  </p>
                  <p className="font-mono-data text-[15px] text-on-surface mt-0.5">
                    {l.got}
                  </p>
                </div>
                <p className="ml-auto font-body-md text-[10px] text-on-surface-variant/60 text-right">
                  {l.cases}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-4 rounded-xl border border-white/10 bg-surface-container/60 px-4 py-3 font-body-md text-[12px] leading-relaxed text-on-surface-variant">
        <span className="text-on-surface font-semibold">
          Baixo risco não significa garantia.
        </span>{" "}
        Toda análise apresenta estimativas, não certezas. Os números acima vêm
        de um teste com jogos que já aconteceram e não se repetem
        necessariamente.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------- 4. How it works */

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Escolha um jogo",
      body: "Toque num dos jogos liberados de hoje. Não precisa de cadastro nem cartão.",
    },
    {
      n: "2",
      title: "Veja os três cenários e a explicação",
      body: "Baixo, médio e alto risco, cada um com a probabilidade estimada e o motivo escrito em português simples.",
    },
    {
      n: "3",
      title: "Desbloqueie os outros jogos por 30 dias",
      body: "Se fizer sentido para você, libere qualquer partida e receba o código de acesso na hora.",
    },
  ];

  return (
    <section className="mt-14">
      <SectionTitle eyebrow="Como funciona" title="Três passos" />
      <div className="flex flex-col gap-4">
        {steps.map((s) => (
          <div key={s.n} className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary-container/15 border border-primary-container/40 flex items-center justify-center">
              <span className="font-mono-data text-[13px] text-primary-container">
                {s.n}
              </span>
            </div>
            <div className="pt-1">
              <h3 className="font-headline-md text-[15px] text-on-surface mb-0.5">
                {s.title}
              </h3>
              <p className="font-body-md text-[13px] leading-relaxed text-on-surface-variant">
                {s.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- 5. Credibility */

function Credibility() {
  const items = [
    { value: String(AUDIT.fixtures), label: "jogos analisados" },
    { value: String(AUDIT.suggestions), label: "sugestões avaliadas" },
    { value: String(AUDIT.leagues), label: "competições" },
  ];

  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="Antes de lançar"
        title="O modelo foi testado antes de ser lançado"
      />

      <div className="grid grid-cols-3 gap-2">
        {items.map((i) => (
          <div
            key={i.label}
            className="glass-card rounded-xl px-2 py-4 text-center"
          >
            <p className="font-display-lg text-[22px] leading-none text-on-surface">
              {i.value}
            </p>
            <p className="mt-1.5 font-body-md text-[11px] leading-tight text-on-surface-variant">
              {i.label}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 font-body-md text-[12px] leading-relaxed text-on-surface-variant">
        Rodamos o modelo em partidas que já tinham terminado, sem deixar que ele
        visse o resultado, e comparamos com o que realmente aconteceu. São{" "}
        <span className="text-on-surface">testes históricos internos</span> — não
        são garantia de resultados futuros.
      </p>
    </section>
  );
}

/* --------------------------------------------------------------- 6. Offer */

function Offer({ price }: { price: PriceView }) {
  return (
    <section className="mt-14">
      <SectionTitle eyebrow="Acesso completo" title="Quer analisar outros jogos?" />

      <div className="glass-card rounded-2xl p-6 border border-primary-container/40 shadow-[0_0_28px_rgba(255,107,0,0.12)]">
        {/* Existing funnel marker, already shipped. Reports the offer step only
            once it is actually scrolled into view. */}
        <SubscriptionOfferTracker surface="start_pricing" />

        <PriceTag
          activeCents={price.activeCents}
          regularCents={price.regularCents}
          isPromo={price.isPromo}
          size="lg"
          // This block states the access does not renew, so "/mês" would
          // contradict it.
          cycleLabel="por 30 dias"
        />

        <ul className="flex flex-col gap-2 mt-5 mb-6">
          <Perk text="Qualquer jogo dos campeonatos que cobrimos, sem limite." />
          <Perk text="Os três cenários e a explicação de cada um." />
          <Perk text="Histórico das suas análises salvo." />
          <Perk text="Acesso por código, sem cadastro e sem senha." />
        </ul>

        <SubscribeButton label="Desbloquear acesso" />

        <div className="mt-4 flex flex-col gap-1.5">
          <Benefit text="Pague no Pix ou no cartão, pela InfinitePay." />
          <Benefit text="O código de acesso aparece assim que o pagamento é confirmado." />
          <Benefit text="Não renova automaticamente: nada é cobrado de novo no fim do período." />
        </div>
      </div>
    </section>
  );
}

function Perk({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 font-body-md text-[13px] text-on-surface-variant">
      <span className="material-symbols-outlined text-emerald-300 text-[16px] mt-0.5 shrink-0">
        check_circle
      </span>
      {text}
    </li>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 font-body-md text-[11px] text-on-surface-variant">
      <span className="material-symbols-outlined text-emerald-300 text-[14px] mt-0.5 shrink-0">
        done
      </span>
      {text}
    </p>
  );
}

/* -------------------------------------------------------- 7. Transparency */

function Transparency() {
  return (
    <section className="mt-14">
      <SectionTitle eyebrow="De cara limpa" title="O que a ApostAI não é" />

      <div className="glass-card rounded-xl p-5 flex flex-col gap-3">
        <Point
          icon="analytics"
          title="É uma ferramenta de análise esportiva"
          body="A gente calcula probabilidades e explica o raciocínio. O que você faz com a informação é sua decisão."
        />
        <div className="h-px w-full bg-white/5" />
        <Point
          icon="block"
          title="Não é uma casa de apostas"
          body="Não aceitamos apostas, não movimentamos o seu dinheiro de jogo e não recebemos comissão de casa nenhuma."
        />
        <div className="h-px w-full bg-white/5" />
        <Point
          icon="trending_down"
          title="Não promete lucro nem garante resultado"
          body="Probabilidade não é certeza. Você pode perder o valor que arriscar, inclusive seguindo uma indicação de baixo risco."
        />
      </div>
    </section>
  );
}

function Point({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="material-symbols-outlined text-primary-container text-[20px] mt-0.5 shrink-0">
        {icon}
      </span>
      <div>
        <h3 className="font-headline-md text-[14px] leading-snug text-on-surface mb-0.5">
          {title}
        </h3>
        <p className="font-body-md text-[13px] leading-relaxed text-on-surface-variant">
          {body}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- 8. FAQ */

function Faq({ price }: { price: PriceView }) {
  const items = [
    {
      q: "O que está incluído?",
      a: "A análise de qualquer jogo dos campeonatos que cobrimos, sem limite de quantidade. Em cada uma você vê os três cenários — baixo, médio e alto risco — com a probabilidade estimada e a explicação de cada indicação. O seu histórico de análises fica salvo.",
    },
    {
      q: "Quantos jogos grátis posso analisar?",
      a: "Três por dia, escolhidos pelo sistema, com horários diferentes ao longo do dia. Abrem completos, sem cadastro e sem cartão. Quando um deles termina, a análise continua disponível ao lado do resultado real.",
    },
    {
      q: "Como recebo o acesso após pagar?",
      a: "Assim que a InfinitePay confirma o pagamento, a tela mostra o seu código de 12 caracteres. Salve na hora: é a sua única forma de entrar e não há recuperação por email. Se a confirmação demorar alguns segundos, a página avisa e você pode atualizar.",
    },
    {
      q: "Por quanto tempo o acesso funciona?",
      a: "30 dias a partir da confirmação do pagamento. Não renova automaticamente: nada é cobrado de novo no fim do período, e é você que decide se quer continuar.",
    },
    {
      q: "Preciso criar cadastro?",
      a: "Não. Não pedimos email, senha nem dados pessoais. Os jogos grátis abrem direto, e quem paga entra apenas com o código de acesso.",
    },
    {
      q: "O ApostAI garante acertos?",
      a: "Não, e desconfie de quem garantir. O que entregamos são probabilidades estimadas e o raciocínio por trás delas. No nosso teste histórico, as indicações de baixo risco saíram como previsto em 74% dos casos avaliados — o que ajuda a decidir melhor, mas não elimina o risco de perder.",
    },
  ];

  return (
    <section className="mt-14">
      <SectionTitle eyebrow="Dúvidas" title="Antes de você perguntar" />
      <div className="flex flex-col gap-2">
        {items.map((i) => (
          <details key={i.q} className="glass-card rounded-xl px-4 py-3 group">
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
              <span className="font-headline-md text-[14px] leading-snug text-on-surface">
                {i.q}
              </span>
              <span className="material-symbols-outlined text-on-surface-variant text-[20px] transition-transform group-open:rotate-180 shrink-0">
                expand_more
              </span>
            </summary>
            <p className="mt-2.5 font-body-md text-[13px] leading-relaxed text-on-surface-variant">
              {i.a}
            </p>
          </details>
        ))}
      </div>
      <p className="mt-3 px-1 font-body-md text-[11px] text-on-surface-variant/70">
        Acesso completo por {formatCents(price.activeCents)}
        {price.isPromo && (
          <> — promoção, de {formatCents(price.regularCents)}</>
        )}
        .
      </p>
    </section>
  );
}

/* ---------------------------------------------------- 9. One final action */

function FinalCta() {
  return (
    <section className="mt-14 text-center">
      <h2 className="font-display-lg text-[26px] leading-tight tracking-tight text-on-surface">
        Comece pelos grátis
      </h2>
      <p className="mt-2 font-body-md text-[14px] text-on-surface-variant">
        Leia uma análise completa hoje e decida depois.
      </p>
      <a
        href="#gratis"
        className="mt-5 w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_24px_rgba(255,107,0,0.45)] flex items-center justify-center gap-2 press"
      >
        Começar análise grátis
        <span className="material-symbols-outlined text-[18px]">
          arrow_upward
        </span>
      </a>
    </section>
  );
}

/**
 * Required by Brazilian betting-advertising rules and by the ad platforms'
 * gambling policies. Also does conversion work: an explicit "we don't promise
 * profit" reads as confidence, not weakness.
 */
function Legal() {
  return (
    <section className="mt-14 border-t border-white/10 pt-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-label-md text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-error/40 bg-error/10 text-error">
          18+
        </span>
        <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">
          Aposte com responsabilidade
        </span>
      </div>
      <p className="font-body-md text-[11px] leading-relaxed text-on-surface-variant/80">
        A ApostAI é uma ferramenta de análise e não é uma casa de apostas. Não
        aceitamos apostas nem movimentamos dinheiro de jogo. Probabilidade não é
        garantia: nenhuma análise assegura retorno, e você pode perder o valor
        que arriscar. Conteúdo para maiores de 18 anos. Aposta pode causar
        dependência — se o jogo deixou de ser diversão, procure ajuda.
      </p>
      <p className="mt-3 font-body-md text-[11px] text-on-surface-variant/60">
        De onde vêm os números: teste histórico interno feito em maio de 2026 com{" "}
        {AUDIT.fixtures} partidas e {AUDIT.suggestions} sugestões avaliadas em{" "}
        {AUDIT.leagues} competições. Resultado passado não se repete
        necessariamente.
      </p>
    </section>
  );
}

function SectionTitle({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-4">
      <span className="font-label-md text-[10px] uppercase tracking-[0.18em] text-primary-container">
        {eyebrow}
      </span>
      <h2 className="font-headline-md text-[20px] leading-tight text-on-surface mt-1">
        {title}
      </h2>
    </div>
  );
}

// The free fixtures come from a live API call, so revalidate rather than
// prerender at build time: the landing stays fast for ad traffic while the
// fixture list stays current.
export const revalidate = 300;
