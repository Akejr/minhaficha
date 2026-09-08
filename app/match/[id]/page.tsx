import { notFound } from "next/navigation";
import Link from "next/link";
import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";
import { MatchHeader } from "@/components/MatchHeader";
import { AISummary } from "@/components/AISummary";
import { BetsSection } from "@/components/BetsSection";
import { MatchStats } from "@/components/MatchStats";
import { SubscribeButton } from "@/components/subscription/SubscribeButton";
import { mockAnalyses, type MatchAnalysis } from "@/lib/mock-analysis";
import {
  getOrCreateAnalysis,
  recordCodeView,
} from "@/lib/supabase/analysis-cache";
import { mapAnalysisToMatchAnalysis } from "@/lib/match-mapper";
import { getCurrentAccess } from "@/lib/access/session";
import { isFreeFixture } from "@/lib/free-fixtures";
import { isPrefetchRequest, logEvent } from "@/lib/analytics/events";
import { PLAN } from "@/lib/plans";

type PageProps = {
  params: { id: string };
};

type LoadResult =
  | { kind: "ok"; analysis: MatchAnalysis; isFree: boolean }
  | { kind: "locked" };

/**
 * Access rules for a fixture:
 *
 *   - one of the 3 "Análise grátis" fixtures → open to everyone, full
 *     analysis, no code needed;
 *   - anything else → needs a valid access code, otherwise we render the
 *     paywall.
 *
 * Note there is no daily quota any more: access is binary.
 */
async function loadAnalysis(id: string): Promise<LoadResult | null> {
  if (id in mockAnalyses) {
    return { kind: "ok", analysis: mockAnalyses[id], isFree: true };
  }
  const fixtureId = Number(id);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) return null;

  const [access, free] = await Promise.all([
    getCurrentAccess(),
    isFreeFixture(fixtureId),
  ]);

  // A router prefetch renders this page in the background. It is NOT a visit,
  // so nothing about it may be recorded — otherwise merely showing a link
  // counts as opening the analysis.
  const prefetch = isPrefetchRequest();

  if (!access && !free) {
    if (!prefetch) await logEvent({ type: "analysis_blocked", fixtureId });
    return { kind: "locked" };
  }

  try {
    const result = await getOrCreateAnalysis(fixtureId);

    if (!prefetch) {
      // History only exists for code holders.
      await recordCodeView(
        access?.code ?? null,
        fixtureId,
        result.payload,
        result.ai,
      );
      await logEvent({
        type: "analysis_view",
        fixtureId,
        code: access?.code ?? null,
        isFree: !access,
        detail: result.fromCache ? "cache" : "calculada",
      });
    }
    return {
      kind: "ok",
      analysis: mapAnalysisToMatchAnalysis(result.payload, result.ai),
      // Free fixtures show every risk level, same as a paid code.
      isFree: free && !access,
    };
  } catch (err) {
    console.error(`[match/${id}] analysis failed:`, err);
    return null;
  }
}

export default async function MatchAnalysisPage({ params }: PageProps) {
  const result = await loadAnalysis(params.id);
  if (!result) notFound();

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern anim-page-in">
        {result.kind === "locked" ? (
          <PaywallCard />
        ) : (
          <div className="flex flex-col gap-6">
            <MatchHeader analysis={result.analysis} />
            {result.isFree && <FreeBadge />}
            <AISummary
              summary={result.analysis.aiSummary}
              confidence={result.analysis.confidence}
            />
            <BetsSection bets={result.analysis.bets} />
            <MatchStats
              stats={result.analysis.stats}
              homeTeam={result.analysis.homeTeam}
              awayTeam={result.analysis.awayTeam}
            />
            {result.isFree && <UpsellCard />}
          </div>
        )}
      </main>

      <BottomNavBar />
    </>
  );
}

function FreeBadge() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5">
      <span className="material-symbols-outlined text-emerald-300 text-[18px]">
        lock_open_right
      </span>
      <p className="font-body-md text-[13px] text-on-surface">
        Análise grátis — liberada para todos, sem código.
      </p>
    </div>
  );
}

function UpsellCard() {
  return (
    <section className="glass-card rounded-2xl p-5 text-center">
      <h3 className="font-headline-md text-[16px] text-on-surface mb-1">
        Quer analisar qualquer jogo?
      </h3>
      <p className="font-body-md text-[13px] text-on-surface-variant mb-4">
        Por {PLAN.priceLabel} {PLAN.cycleLabel} você libera todos os jogos e
        recebe um código de acesso na hora.
      </p>
      <SubscribeButton />
    </section>
  );
}

/**
 * Shown when a visitor without a code opens a fixture that isn't free.
 * Two exits: buy, or enter an existing code.
 */
function PaywallCard() {
  return (
    <section className="flex flex-col items-center text-center pt-4">
      <div className="relative mb-5">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-container/30 to-secondary-container/30 blur-3xl rounded-full" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-container to-secondary-container flex items-center justify-center shadow-[0_0_40px_rgba(255,107,0,0.4)]">
          <span className="material-symbols-outlined text-white text-[36px]">
            lock
          </span>
        </div>
      </div>

      <span className="font-label-md text-label-md uppercase tracking-[0.2em] text-primary-container mb-2">
        Jogo bloqueado
      </span>
      <h2 className="font-display-lg text-[26px] leading-tight text-on-surface mb-2 tracking-tight">
        Este jogo é
        <br />
        para assinantes
      </h2>
      <p className="font-body-md text-[14px] text-on-surface-variant mb-6 max-w-[300px]">
        Os 3 jogos da seção &ldquo;Análise grátis&rdquo; na home são sempre
        liberados. Para analisar qualquer outro jogo, assine.
      </p>

      <div className="glass-card rounded-2xl p-5 w-full text-left mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-md text-label-md uppercase tracking-wider text-primary-container">
            {PLAN.name}
          </span>
          <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">
            30 dias
          </span>
        </div>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="font-display-lg text-[36px] text-on-surface leading-none">
            {PLAN.priceLabel}
          </span>
          <span className="font-headline-md text-[14px] text-on-surface-variant">
            /mês
          </span>
        </div>
        <ul className="flex flex-col gap-2 mb-1">
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
      </div>

      <SubscribeButton />

      <Link
        href="/entrar"
        className="mt-3 font-label-md text-label-md text-primary-container hover:opacity-80 transition-opacity"
      >
        Já tenho um código
      </Link>
      <Link
        href="/"
        className="mt-3 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
      >
        Ver os jogos grátis
      </Link>
    </section>
  );
}

// Reads the access cookie, so it must render per-request.
export const dynamic = "force-dynamic";
