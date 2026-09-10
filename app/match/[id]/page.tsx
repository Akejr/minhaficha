import { notFound } from "next/navigation";
import Link from "next/link";
import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";
import { MatchHeader } from "@/components/MatchHeader";
import { AISummary } from "@/components/AISummary";
import { BetsSection } from "@/components/BetsSection";
import { MatchStats } from "@/components/MatchStats";
import { SubscribeButton } from "@/components/subscription/SubscribeButton";
import { FreeAnalysisPromo } from "@/components/subscription/FreeAnalysisPromo";
import { mockAnalyses, type MatchAnalysis } from "@/lib/mock-analysis";
import {
  getOrCreateAnalysis,
  recordCodeView,
} from "@/lib/supabase/analysis-cache";
import { mapAnalysisToMatchAnalysis } from "@/lib/match-mapper";
import { getCurrentAccess } from "@/lib/access/session";
import { isFreeFixture } from "@/lib/free-fixtures";
import { isPrefetchRequest, logEvent } from "@/lib/analytics/events";
import { priceView, type PriceView } from "@/lib/settings";
import { PLAN, formatCents } from "@/lib/plans";
import { PriceTag } from "@/components/subscription/PriceTag";

type PageProps = {
  params: { id: string };
};

type LoadResult = {
  analysis: MatchAnalysis;
  /** Free fixture opened without a code. */
  isFree: boolean;
  /** Holds a valid access code. */
  hasCode: boolean;
  /** Paid fixture opened without a code → bets are blurred. */
  locked: boolean;
};

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
    return {
      analysis: mockAnalyses[id],
      isFree: true,
      hasCode: false,
      locked: false,
    };
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

  try {
    const result = await getOrCreateAnalysis(fixtureId);

    // A visitor with no code, on a paid fixture, is the "locked" case: we
    // still show the full match analysis (summary + stats) but blur the bets,
    // rather than a hard wall — that teaser converts far better.
    const locked = !access && !free;

    if (!prefetch) {
      // History only exists for code holders.
      await recordCodeView(
        access?.code ?? null,
        fixtureId,
        result.payload,
        result.ai,
      );
      await logEvent({
        type: locked ? "analysis_blocked" : "analysis_view",
        fixtureId,
        code: access?.code ?? null,
        isFree: !access,
        detail: result.fromCache ? "cache" : "calculada",
      });
    }
    return {
      analysis: mapAnalysisToMatchAnalysis(result.payload, result.ai),
      // isFree  = free fixture opened without a code → everything visible.
      // hasCode = paid access → everything visible.
      // neither = paid fixture without a code → bets blurred (locked below).
      isFree: free && !access,
      hasCode: !!access,
      locked,
    };
  } catch (err) {
    console.error(`[match/${id}] analysis failed:`, err);
    return null;
  }
}

export default async function MatchAnalysisPage({ params }: PageProps) {
  const [result, price] = await Promise.all([
    loadAnalysis(params.id),
    priceView(),
  ]);
  if (!result) notFound();

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern anim-page-in">
        <div className="flex flex-col gap-6">
          <MatchHeader analysis={result.analysis} />
          {result.isFree && <FreeBadge />}
          {result.locked && <LockedBadge />}
          <AISummary
            summary={result.analysis.aiSummary}
            confidence={result.analysis.confidence}
          />
          {/* Blur the picks ONLY for a paid fixture opened without a code.
              Free fixtures are the shop window and show everything; code
              holders see everything. */}
          <BetsSection bets={result.analysis.bets} locked={result.locked} />
          <MatchStats
            stats={result.analysis.stats}
            homeTeam={result.analysis.homeTeam}
            awayTeam={result.analysis.awayTeam}
          />
          {/* Sell to anyone without a code — both the free reader and the one
              who hit a locked paid fixture. */}
          {!result.hasCode && <UpsellCard price={price} />}
          {/* Nudge modal for logged-out visitors, while a promo is on. */}
          {!result.hasCode && price.isPromo && (
            <FreeAnalysisPromo
              priceCents={price.activeCents}
              regularCents={price.regularCents}
            />
          )}
        </div>
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

/** Shown at the top when a paid fixture is opened without a code. */
function LockedBadge() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary-container/40 bg-primary-container/10 px-4 py-2.5">
      <span className="material-symbols-outlined text-primary-container text-[18px]">
        lock
      </span>
      <p className="font-body-md text-[13px] text-on-surface">
        Jogo de assinante. Veja a análise; os palpites são exclusivos —
        assine para liberar.
      </p>
    </div>
  );
}

function UpsellCard({ price }: { price: PriceView }) {
  return (
    <section className="glass-card rounded-2xl p-5 text-center">
      <h3 className="font-headline-md text-[16px] text-on-surface mb-1">
        Quer ver os palpites e analisar qualquer jogo?
      </h3>
      <p className="font-body-md text-[13px] text-on-surface-variant mb-4">
        {price.isPromo ? (
          <>
            De {formatCents(price.regularCents)} por{" "}
            <span className="text-on-surface font-semibold">
              {formatCents(price.activeCents)}
            </span>{" "}
            {PLAN.cycleLabel} — promoção por tempo limitado. Libera todos os
            jogos e você recebe o código na hora.
          </>
        ) : (
          <>
            Por {formatCents(price.activeCents)} {PLAN.cycleLabel} você libera
            todos os jogos e recebe um código de acesso na hora.
          </>
        )}
      </p>
      <SubscribeButton
        label={`Assinar por ${formatCents(price.activeCents)}`}
      />

      <Link
        href="/entrar"
        className="mt-3 inline-block font-label-md text-label-md text-primary-container hover:opacity-80 transition-opacity"
      >
        Já tenho um código
      </Link>
    </section>
  );
}

// Reads the access cookie, so it must render per-request.
export const dynamic = "force-dynamic";
