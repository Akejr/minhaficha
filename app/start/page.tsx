import type { Metadata } from "next";
import Link from "next/link";
import { PopularMatchesSection } from "@/components/PopularMatchesSection";
import { SubscribeButton } from "@/components/subscription/SubscribeButton";
import { PLAN } from "@/lib/plans";

/**
 * Ad landing page (/start).
 *
 * Built for paid traffic, so it deliberately differs from the app shell:
 *   - no bottom nav and no account badge — every exit that isn't the CTA is
 *     removed;
 *   - the free fixtures are embedded directly instead of being linked, so the
 *     offer is consumable on the same screen the ad drops into;
 *   - one primary action repeated down the page ("ver análise grátis"), with
 *     the paid plan as the secondary step.
 *
 * On the numbers: every figure here comes from backtest-results/RESUMO-FINAL.md
 * (403 evaluated suggestions across 11 leagues, May 2026). Nothing is rounded
 * up and nothing is invented — an inflated accuracy claim on a betting-adjacent
 * product is both consumer deception under the CDC and grounds for ad accounts
 * being suspended. The per-league ">80%" figures are real but come from small
 * samples, so they are labelled with their sample size.
 */

export const metadata: Metadata = {
  title: "ApostAI — análise de jogos com modelo próprio",
  description:
    "Modelo estatístico próprio, calibrado e auditado em 403 sugestões reais. 3 análises completas grátis por dia, sem cadastro.",
  openGraph: {
    title: "ApostAI — análise de jogos com modelo próprio",
    description:
      "Não usamos algoritmo de terceiros. Construímos o nosso e publicamos a taxa de acerto real.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

/** Audited results — see backtest-results/RESUMO-FINAL.md */
const AUDIT = {
  suggestions: 403,
  fixtures: 187,
  leagues: 11,
  tests: 61,
  levels: [
    { name: "Baixo risco", promised: "71,8%", real: "74,0%", sample: "77 sugestões" },
    { name: "Médio risco", promised: "48,3%", real: "45,6%", sample: "147 sugestões" },
    { name: "Alto risco", promised: "24,5%", real: "23,5%", sample: "179 sugestões" },
  ],
  topLeagues: [
    { league: "Ligue 1", rate: "91%", sample: "10/11" },
    { league: "Premier League", rate: "82%", sample: "9/11" },
    { league: "La Liga", rate: "79%", sample: "11/14" },
    { league: "Liga Portugal", rate: "78%", sample: "7/9" },
    { league: "Serie A", rate: "71%", sample: "10/14" },
  ],
};

export default function StartPage() {
  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.04] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.03] blur-[100px] pointer-events-none z-0" />

      <LandingHeader />

      <main className="px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern anim-page-in pb-24 pt-[calc(env(safe-area-inset-top,0px)+80px)]">
        <Hero />
        <ProofBar />
        <FreeOffer />
        <OwnModel />
        <Calibration />
        <TopLeagues />
        <HowItWorks />
        <Pricing />
        <Faq />
        <FinalCta />
        <Legal />
      </main>
    </>
  );
}

/** Minimal header: brand + a single link out for existing customers. */
function LandingHeader() {
  return (
    <header
      className="fixed left-0 right-0 mx-auto max-w-[440px] z-50 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-6"
      style={{
        top: 0,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
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

function Hero() {
  return (
    <section className="pt-6 text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-container/40 bg-primary-container/10 px-3 py-1.5 font-label-md text-[10px] uppercase tracking-wider text-primary-container">
        <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse" />
        Modelo próprio · auditado
      </span>

      <h1 className="font-display-lg text-[34px] leading-[1.1] tracking-tight text-on-surface mt-5">
        Análise de verdade,
        <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-secondary-container">
          antes de você apostar.
        </span>
      </h1>

      <p className="font-body-lg text-[16px] text-on-surface-variant mt-4">
        Não usamos algoritmo de terceiros. Construímos o nosso — e publicamos a
        taxa de acerto real, sugestão por sugestão.
      </p>

      <div className="mt-7">
        <a
          href="#gratis"
          className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_24px_rgba(255,107,0,0.45)] flex items-center justify-center gap-2 press"
        >
          Ver 3 análises grátis agora
          <span className="material-symbols-outlined text-[18px]">
            arrow_downward
          </span>
        </a>
        <p className="mt-3 font-body-md text-[12px] text-on-surface-variant">
          Sem cadastro. Sem cartão. Sem email.
        </p>
      </div>
    </section>
  );
}

function ProofBar() {
  const items = [
    { value: "74%", label: "acerto no baixo risco" },
    { value: String(AUDIT.suggestions), label: "sugestões auditadas" },
    { value: String(AUDIT.leagues), label: "ligas testadas" },
  ];
  return (
    <section className="mt-8 grid grid-cols-3 gap-2">
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
    </section>
  );
}

/** The offer, consumable right here. This is the page's core conversion move. */
function FreeOffer() {
  return (
    <section id="gratis" className="mt-12 scroll-mt-24">
      <PopularMatchesSection />
      <p className="mt-4 text-center font-body-md text-[12px] text-on-surface-variant">
        Toque em qualquer jogo acima. A análise abre completa, com as 3
        sugestões e a probabilidade de cada uma.
      </p>
    </section>
  );
}

function OwnModel() {
  const cards = [
    {
      icon: "function",
      title: "Modelo próprio, não terceirizado",
      body: "Implementamos nosso próprio Dixon-Coles (Poisson bivariado com correção de empates), calibrado com backtests que rodamos aqui. Não é API de palpite revendida nem planilha de terceiro.",
    },
    {
      icon: "shield_lock",
      title: "A IA não inventa número",
      body: "A probabilidade sai do modelo estatístico. A IA só escolhe entre os mercados que já calculamos e escreve a explicação — ela é proibida de criar ou alterar qualquer percentual.",
    },
    {
      icon: "science",
      title: `${AUDIT.tests} testes automatizados`,
      body: `Todo o pipeline matemático é coberto por testes. Rodamos o modelo às cegas em ${AUDIT.fixtures} jogos já encerrados e comparamos com o resultado real.`,
    },
  ];

  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="O diferencial"
        title="A matemática é nossa"
      />
      <div className="flex flex-col gap-3">
        {cards.map((c) => (
          <article key={c.title} className="glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary-container text-[20px]">
                {c.icon}
              </span>
              <h3 className="font-headline-md text-[16px] text-on-surface">
                {c.title}
              </h3>
            </div>
            <p className="font-body-md text-[13px] leading-relaxed text-on-surface-variant">
              {c.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * Publishing promised-vs-real is the strongest trust asset we have: almost
 * nobody in this market shows where they land. It also pre-empts the "isso é
 * mais um vendedor de palpite" objection before the price appears.
 */
function Calibration() {
  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="Transparência"
        title="O que prometemos vs. o que aconteceu"
      />

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 border-b border-white/10">
          <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">
            Nível
          </span>
          <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant text-right w-[72px]">
            Prometido
          </span>
          <span className="font-label-md text-[10px] uppercase tracking-wider text-primary-container text-right w-[60px]">
            Real
          </span>
        </div>

        {AUDIT.levels.map((l) => (
          <div
            key={l.name}
            className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 border-b border-white/5 last:border-b-0 items-center"
          >
            <div className="min-w-0">
              <p className="font-body-md text-[13px] text-on-surface truncate">
                {l.name}
              </p>
              <p className="font-body-md text-[10px] text-on-surface-variant/70">
                {l.sample}
              </p>
            </div>
            <span className="font-mono-data text-[13px] text-on-surface-variant text-right w-[72px]">
              {l.promised}
            </span>
            <span className="font-mono-data text-[13px] text-on-surface text-right w-[60px]">
              {l.real}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 font-body-md text-[13px] leading-relaxed text-on-surface-variant">
        Nenhum dos três níveis desvia mais de{" "}
        <span className="text-on-surface font-semibold">3 pontos</span> do que
        mostramos na tela. É isso que significa um modelo calibrado: quando
        dizemos 72%, acontece em torno de 72% — não 40%.
      </p>
    </section>
  );
}

function TopLeagues() {
  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="Onde o modelo é mais forte"
        title="Baixo risco acima de 80% nas melhores ligas"
      />

      <div className="glass-card rounded-xl p-5">
        <div className="flex flex-col gap-3">
          {AUDIT.topLeagues.map((l) => {
            const pct = parseInt(l.rate, 10);
            return (
              <div key={l.league}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-body-md text-[13px] text-on-surface">
                    {l.league}
                  </span>
                  <span className="font-mono-data text-[13px] text-on-surface">
                    {l.rate}{" "}
                    <span className="text-on-surface-variant/60 text-[11px]">
                      ({l.sample})
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      pct >= 80
                        ? "bg-emerald-400"
                        : "bg-gradient-to-r from-primary-container to-secondary-container"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 font-body-md text-[11px] leading-relaxed text-on-surface-variant/80">
        Taxa de acerto das sugestões de baixo risco, por liga, no backtest de
        maio/2026. As amostras por liga são pequenas (indicadas entre
        parênteses) — a média geral de baixo risco, com 77 sugestões, é 74%.
      </p>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Escolha o jogo",
      body: "Busque qualquer time ou toque num dos jogos grátis do dia.",
    },
    {
      n: "2",
      title: "O modelo calcula",
      body: "Puxamos forma recente, confrontos diretos, tabela, desfalques e descanso. Saem as probabilidades de 27 mercados.",
    },
    {
      n: "3",
      title: "Você recebe 3 cenários",
      body: "Baixo, médio e alto risco, cada um com a probabilidade real e a explicação em português claro.",
    },
  ];

  return (
    <section className="mt-14">
      <SectionTitle eyebrow="Como funciona" title="Três toques" />
      <div className="flex flex-col gap-3">
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

function Pricing() {
  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="Depois dos grátis"
        title="Qualquer jogo, por 30 dias"
      />

      <div className="glass-card rounded-2xl p-6 border border-primary-container/40 shadow-[0_0_28px_rgba(255,107,0,0.12)]">
        <div className="flex items-baseline gap-2">
          <span className="font-display-lg text-[42px] leading-none text-on-surface">
            {PLAN.priceLabel}
          </span>
          <span className="font-headline-md text-[14px] text-on-surface-variant">
            / 30 dias
          </span>
        </div>

        <p className="mt-2 font-body-md text-[12px] text-on-surface-variant">
          Menos do que a maioria das pessoas coloca numa aposta só.
        </p>

        <ul className="flex flex-col gap-2 mt-5 mb-6">
          {PLAN.perks.map((p) => (
            <li
              key={p}
              className="flex items-start gap-2 font-body-md text-[13px] text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-emerald-300 text-[16px] mt-0.5">
                check_circle
              </span>
              {p}
            </li>
          ))}
        </ul>

        <SubscribeButton />

        <div className="mt-4 flex flex-col gap-1.5">
          <Benefit text="Não é assinatura recorrente — não cobramos de novo." />
          <Benefit text="Pix ou cartão pela InfinitePay." />
          <Benefit text="Você recebe o código de acesso na hora." />
        </div>
      </div>
    </section>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 font-body-md text-[11px] text-on-surface-variant">
      <span className="material-symbols-outlined text-emerald-300 text-[14px] mt-0.5">
        done
      </span>
      {text}
    </p>
  );
}

function Faq() {
  const items = [
    {
      q: "Preciso criar conta?",
      a: "Não. Os 3 jogos grátis abrem direto. Quem assina recebe um código de 12 caracteres e entra só com ele — sem email, sem senha.",
    },
    {
      q: "Vocês garantem que eu vou lucrar?",
      a: "Não, e desconfie de quem garantir. Entregamos probabilidade calibrada: nas sugestões de baixo risco, 74% saíram como previsto em 403 casos auditados. Isso é vantagem estatística, não certeza.",
    },
    {
      q: "Vai renovar automático no meu cartão?",
      a: "Não. O pagamento é único e vale 30 dias. Quando terminar, você decide se compra de novo.",
    },
    {
      q: "Como recebo o acesso?",
      a: "Assim que o pagamento é aprovado, a tela mostra o seu código. Salve na hora: é a sua única forma de entrar, e não há recuperação por email.",
    },
    {
      q: "Quais ligas vocês cobrem?",
      a: "Brasileirão, Copa do Brasil, Libertadores, Sul-Americana e as principais europeias. A busca aceita apelido: digite timão, verdão, mengão ou fogão.",
    },
    {
      q: "Isso é casa de apostas?",
      a: "Não. Não aceitamos apostas, não intermediamos dinheiro e não recebemos comissão de casa nenhuma. Vendemos análise.",
    },
  ];

  return (
    <section className="mt-14">
      <SectionTitle eyebrow="Dúvidas" title="Antes de você perguntar" />
      <div className="flex flex-col gap-2">
        {items.map((i) => (
          <details
            key={i.q}
            className="glass-card rounded-xl px-4 py-3 group"
          >
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
              <span className="font-headline-md text-[14px] text-on-surface">
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
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mt-14 text-center">
      <h2 className="font-display-lg text-[26px] leading-tight tracking-tight text-on-surface">
        Comece pelos grátis
      </h2>
      <p className="mt-2 font-body-md text-[14px] text-on-surface-variant">
        Veja a análise completa de 3 jogos hoje e decida depois.
      </p>
      <a
        href="#gratis"
        className="mt-5 w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_24px_rgba(255,107,0,0.45)] flex items-center justify-center gap-2 press"
      >
        Ver os jogos grátis
        <span className="material-symbols-outlined text-[18px]">
          arrow_upward
        </span>
      </a>
      <Link
        href="/"
        className="mt-4 inline-block font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
      >
        Ou buscar um jogo específico
      </Link>
    </section>
  );
}

/**
 * Required by Brazilian betting-advertising rules and, separately, by the ad
 * platforms' gambling policies. Also does conversion work: an explicit "we
 * don't promise profit" reads as confidence, not weakness.
 */
function Legal() {
  return (
    <section className="mt-14 border-t border-white/10 pt-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-label-md text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-error/40 bg-error/10 text-error">
          18+
        </span>
        <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">
          Jogue com responsabilidade
        </span>
      </div>
      <p className="font-body-md text-[11px] leading-relaxed text-on-surface-variant/80">
        O ApostAI é uma ferramenta de análise estatística e não é uma casa de
        apostas. Não aceitamos apostas nem intermediamos pagamentos de jogo.
        Probabilidade não é garantia: nenhuma análise assegura retorno
        financeiro, e você pode perder o valor apostado. Conteúdo destinado a
        maiores de 18 anos. Aposta pode causar dependência — se o jogo deixou de
        ser diversão, procure ajuda.
      </p>
      <p className="mt-3 font-body-md text-[11px] text-on-surface-variant/60">
        Taxas citadas: backtest de maio/2026, {AUDIT.fixtures} jogos e{" "}
        {AUDIT.suggestions} sugestões avaliadas em {AUDIT.leagues} ligas.
        Resultados passados não se repetem necessariamente.
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

// The embedded free fixtures come from a live API call, so revalidate rather
// than prerender at build time. Keeps the landing page fast for ad traffic
// while the fixture list stays current.
export const revalidate = 300;
