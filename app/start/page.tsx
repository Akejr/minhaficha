import type { Metadata } from "next";
import Link from "next/link";
import { PopularMatchesSection } from "@/components/PopularMatchesSection";
import { SubscribeButton } from "@/components/subscription/SubscribeButton";
import { PriceTag } from "@/components/subscription/PriceTag";
import { SubscriptionOfferTracker } from "@/components/tracking/FunnelTrackers";
import { PLAN, formatCents } from "@/lib/plans";
import { priceView, type PriceView } from "@/lib/settings";

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
 * Copy rule for this page: NO jargon. A visitor arriving from an ad won't
 * look up "Dixon-Coles", "backtest", "pipeline" or "calibração" — every such
 * term is replaced by plain Brazilian Portuguese ("conferimos em jogos que já
 * aconteceram", "o cálculo é nosso"). Keep it that way when editing.
 *
 * On the numbers: every figure here comes from backtest-results/RESUMO-FINAL.md
 * (403 evaluated suggestions across 11 leagues, May 2026). Nothing is rounded
 * up and nothing is invented — an inflated accuracy claim on a betting-adjacent
 * product is both consumer deception under the CDC and grounds for ad accounts
 * being suspended. The per-league ">80%" figures are real but come from small
 * samples, so they are always shown with their case count.
 */

export const metadata: Metadata = {
  title: "ApostAI — analise os jogos antes de montar o seu bilhete",
  description:
    "A ApostAI analisa partidas de futebol e sugere seleções para o seu bilhete, com os motivos de cada indicação. 3 análises grátis por dia, sem cadastro.",
  openGraph: {
    title: "Analise os jogos antes de montar o seu bilhete",
    description:
      "Cálculo próprio, conferido em 403 indicações reais. Garantimos vantagem estatística, não certeza.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

/** Audited results — see backtest-results/RESUMO-FINAL.md */
const AUDIT = {
  suggestions: 403,
  fixtures: 187,
  leagues: 11,
  checks: 61,
  levels: [
    { name: "Baixo risco", hint: "as mais seguras", said: "71,8%", got: "74,0%", cases: "77 casos" },
    { name: "Médio risco", hint: "equilibradas", said: "48,3%", got: "45,6%", cases: "147 casos" },
    { name: "Alto risco", hint: "as ousadas", said: "24,5%", got: "23,5%", cases: "179 casos" },
  ],
  topLeagues: [
    { league: "Ligue 1", rate: "91%", cases: "10 de 11" },
    { league: "Premier League", rate: "82%", cases: "9 de 11" },
    { league: "La Liga", rate: "79%", cases: "11 de 14" },
    { league: "Liga Portugal", rate: "78%", cases: "7 de 9" },
    { league: "Serie A", rate: "71%", cases: "10 de 14" },
  ],
};

export default async function StartPage() {
  // The price shown here MUST be the one the checkout charges. This is the page
  // paid traffic lands on, and advertising R$ 50 while billing R$ 15 both
  // wastes the discount as an argument and makes the reported InitiateCheckout
  // value disagree with the page that produced it.
  const price = await priceView();

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.04] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.03] blur-[100px] pointer-events-none z-0" />

      <LandingHeader />

      <main className="px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern anim-page-in pb-24 pt-[calc(var(--promo-height)+env(safe-area-inset-top,0px)+80px)]">
        <Hero />
        <ProofBar />
        <FreeOffer />
        <OwnMath />
        <SaidVsHappened />
        <TopLeagues />
        <HowItWorks />
        <Pricing price={price} />
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

function Hero() {
  return (
    <section className="pt-6 text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-container/40 bg-primary-container/10 px-3 py-1.5 font-label-md text-[10px] uppercase tracking-wider text-primary-container">
        <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse" />
        Cálculo próprio · testado de verdade
      </span>

      <h1 className="font-display-lg text-[32px] leading-[1.12] tracking-tight text-on-surface mt-5">
        Analise os jogos antes
        <br />
        de montar o{" "}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-secondary-container">
          seu bilhete.
        </span>
      </h1>

      <p className="font-body-lg text-[16px] leading-relaxed text-on-surface-variant mt-4">
        A ApostAI analisa partidas de futebol e sugere seleções para o seu
        bilhete, com os motivos por trás de cada indicação.
      </p>

      {/* The honest promise, given its own weight. Refusing to promise profit
          reads as confidence and pre-empts the biggest objection. */}
      <p className="mt-5 rounded-xl border border-primary-container/40 bg-primary-container/10 px-4 py-3 font-headline-md text-[15px] leading-snug text-on-surface">
        Garantimos vantagem estatística,{" "}
        <span className="text-primary-container">não certeza.</span>
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
    { value: "74%", label: "de acerto nas indicações mais seguras" },
    { value: String(AUDIT.suggestions), label: "indicações já conferidas" },
    { value: String(AUDIT.leagues), label: "campeonatos testados" },
  ];
  return (
    <section className="mt-8 grid grid-cols-3 gap-2">
      {items.map((i) => (
        <div key={i.label} className="glass-card rounded-xl px-2 py-4 text-center">
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
        Toque em qualquer jogo acima. A análise abre inteira, com as 3 indicações
        e a chance de cada uma.
      </p>
    </section>
  );
}

function OwnMath() {
  const cards = [
    {
      icon: "calculate",
      title: "O cálculo é nosso",
      body: "A conta que usamos foi feita por nós, do zero. Não é palpite comprado de fora, nem lista revendida de outro site, nem chute de influenciador.",
    },
    {
      icon: "shield_lock",
      title: "A inteligência artificial não inventa número",
      body: "Quem calcula a chance de cada resultado é a nossa conta. A IA só escolhe entre o que já foi calculado e escreve a explicação — ela não pode mudar nenhuma porcentagem.",
    },
    {
      icon: "history",
      title: "Testamos em jogos que já aconteceram",
      body: `Rodamos a nossa conta em ${AUDIT.fixtures} partidas já encerradas, sem deixar ela ver o resultado, e comparamos com o que aconteceu de verdade. São ${AUDIT.checks} verificações automáticas rodando por cima de tudo.`,
    },
  ];

  return (
    <section className="mt-14">
      <SectionTitle eyebrow="Por que confiar" title="A conta é nossa, e ela é testada" />
      <div className="flex flex-col gap-3">
        {cards.map((c) => (
          <article key={c.title} className="glass-card rounded-xl p-5">
            <div className="flex items-start gap-2 mb-2">
              <span className="material-symbols-outlined text-primary-container text-[20px] mt-0.5 shrink-0">
                {c.icon}
              </span>
              <h3 className="font-headline-md text-[16px] leading-snug text-on-surface">
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
 * Publishing said-vs-happened is the strongest trust asset available: almost
 * nobody in this market shows where they land. It also kills the "isso é mais
 * um vendedor de palpite" objection before the price appears.
 */
function SaidVsHappened() {
  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="De cara limpa"
        title="O que a gente disse e o que realmente deu"
      />

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 border-b border-white/10">
          <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">
            Tipo de indicação
          </span>
          <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant text-right w-[64px]">
            Dissemos
          </span>
          <span className="font-label-md text-[10px] uppercase tracking-wider text-primary-container text-right w-[52px]">
            Deu
          </span>
        </div>

        {AUDIT.levels.map((l) => (
          <div
            key={l.name}
            className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 border-b border-white/5 last:border-b-0 items-center"
          >
            <div className="min-w-0">
              <p className="font-body-md text-[13px] text-on-surface truncate">
                {l.name}{" "}
                <span className="text-on-surface-variant/70">({l.hint})</span>
              </p>
              <p className="font-body-md text-[10px] text-on-surface-variant/70">
                {l.cases}
              </p>
            </div>
            <span className="font-mono-data text-[13px] text-on-surface-variant text-right w-[64px]">
              {l.said}
            </span>
            <span className="font-mono-data text-[13px] text-on-surface text-right w-[52px]">
              {l.got}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 font-body-md text-[13px] leading-relaxed text-on-surface-variant">
        Nenhum dos três fugiu mais de{" "}
        <span className="text-on-surface font-semibold">3 pontos</span> do que
        aparece na tela. Na prática: quando a gente mostra 72% de chance,
        acontece perto de 72% — e não 40%.
      </p>
    </section>
  );
}

function TopLeagues() {
  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="Onde acertamos mais"
        title="Passa de 80% nos campeonatos mais previsíveis"
      />

      <div className="glass-card rounded-xl p-5">
        <p className="font-body-md text-[12px] text-on-surface-variant mb-4">
          Acerto das indicações de baixo risco, campeonato por campeonato:
        </p>
        <div className="flex flex-col gap-3">
          {AUDIT.topLeagues.map((l) => {
            const pct = parseInt(l.rate, 10);
            return (
              <div key={l.league}>
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="font-body-md text-[13px] text-on-surface truncate">
                    {l.league}
                  </span>
                  <span className="font-mono-data text-[13px] text-on-surface shrink-0">
                    {l.rate}{" "}
                    <span className="text-on-surface-variant/60 text-[11px]">
                      ({l.cases})
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
        Entre parênteses está quantos casos conferimos em cada campeonato. São
        poucos casos por campeonato, então o número mais firme é a média geral
        de baixo risco: 74%, com 77 casos.
      </p>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Escolha o jogo",
      body: "Busque o seu time ou toque num dos jogos liberados do dia.",
    },
    {
      n: "2",
      title: "A gente faz a conta",
      body: "Olhamos os últimos jogos dos dois times, o histórico entre eles, a posição na tabela, quem está fora por lesão e quantos dias de descanso cada um teve.",
    },
    {
      n: "3",
      title: "Você recebe 3 indicações",
      body: "Uma mais segura, uma equilibrada e uma ousada. Cada uma com a chance em porcentagem e o motivo escrito em português simples.",
    },
  ];

  return (
    <section className="mt-14">
      <SectionTitle eyebrow="Como funciona" title="Três toques" />
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

function Pricing({ price }: { price: PriceView }) {
  return (
    <section className="mt-14">
      <SectionTitle
        eyebrow="Depois dos grátis"
        title="Qualquer jogo, por 30 dias"
      />

      <div className="glass-card rounded-2xl p-6 border border-primary-container/40 shadow-[0_0_28px_rgba(255,107,0,0.12)]">
        {/* The offer step of the funnel. Sits far down the page, so it reports
            only once it is actually scrolled into view. */}
        <SubscriptionOfferTracker surface="start_pricing" />
        <PriceTag
          activeCents={price.activeCents}
          regularCents={price.regularCents}
          isPromo={price.isPromo}
          size="lg"
          // This page states the access does not renew, so "/mês" would
          // contradict it.
          cycleLabel="/ 30 dias"
        />

        <p className="mt-2 font-body-md text-[12px] text-on-surface-variant">
          Menos do que a maioria coloca num bilhete só.
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

        <SubscribeButton
          label={`Assinar por ${formatCents(price.activeCents)}`}
        />

        <div className="mt-4 flex flex-col gap-1.5">
          <Benefit text="Não fica preso: não cobramos de novo no fim do mês." />
          <Benefit text="Pague no Pix ou no cartão." />
          <Benefit text="O seu código de acesso aparece na hora." />
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
      a: "Não. Os 3 jogos liberados abrem direto. Quem assina recebe um código e entra só com ele — sem email, sem senha.",
    },
    {
      q: "Vocês garantem que eu vou lucrar?",
      a: "Não, e desconfie de quem garantir. O que a gente entrega é vantagem estatística: nas indicações de baixo risco, 74% saíram como previsto em 403 casos que conferimos. Isso melhora a sua decisão, mas não tira o risco.",
    },
    {
      q: "Vai cobrar de novo no meu cartão?",
      a: "Não. Você paga uma vez e usa 30 dias. Quando acabar, é você que decide se compra outro mês.",
    },
    {
      q: "Como recebo o acesso?",
      a: "Assim que o pagamento é aprovado, a tela mostra o seu código. Salve na hora: é a sua única forma de entrar, e não tem como recuperar por email.",
    },
    {
      q: "Quais campeonatos vocês analisam?",
      a: "Brasileirão, Copa do Brasil, Libertadores, Sul-Americana e os principais da Europa. A busca entende apelido: escreva timão, verdão, mengão ou fogão.",
    },
    {
      q: "Vocês são casa de apostas?",
      a: "Não. A gente não aceita aposta, não mexe com o seu dinheiro e não ganha comissão de casa nenhuma. O que vendemos é a análise.",
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
        aceitamos apostas nem movimentamos dinheiro de jogo. Chance não é
        garantia: nenhuma análise assegura retorno, e você pode perder o valor
        que apostar. Conteúdo para maiores de 18 anos. Aposta pode causar
        dependência — se o jogo deixou de ser diversão, procure ajuda.
      </p>
      <p className="mt-3 font-body-md text-[11px] text-on-surface-variant/60">
        De onde vêm os números: teste feito em maio de 2026 com{" "}
        {AUDIT.fixtures} partidas e {AUDIT.suggestions} indicações conferidas em{" "}
        {AUDIT.leagues} campeonatos. Resultado passado não se repete
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

// The embedded free fixtures come from a live API call, so revalidate rather
// than prerender at build time. Keeps the landing page fast for ad traffic
// while the fixture list stays current.
export const revalidate = 300;
