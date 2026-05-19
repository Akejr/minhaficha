import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";
import { MatchHeader } from "@/components/MatchHeader";
import { AISummary } from "@/components/AISummary";
import { BetsSection } from "@/components/BetsSection";
import { MatchStats } from "@/components/MatchStats";
import { mockAnalyses, type MatchAnalysis } from "@/lib/mock-analysis";
import {
  getOrCreateAnalysis,
  recordUserView,
} from "@/lib/supabase/analysis-cache";
import { mapAnalysisToMatchAnalysis } from "@/lib/match-mapper";
import { createServerClient, serviceRoleClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/supabase/session";
import {
  FREE_DAILY_LIMIT,
  type PlanInfo,
  PLANS,
} from "@/lib/plans";
import type { Plan } from "@/lib/supabase/types";

type PageProps = {
  params: { id: string };
};

type LoadResult =
  | { kind: "ok"; analysis: MatchAnalysis; plan: Plan }
  | { kind: "limit"; planInfo: PlanInfo };

/**
 * Load the analysis applying the same paywall rules as /api/analyze:
 *   - free users: 2/day limit; show paywall card if exceeded
 *   - any plan: served from Supabase cache when available
 */
async function loadAnalysis(id: string): Promise<LoadResult | null> {
  if (id in mockAnalyses) {
    return { kind: "ok", analysis: mockAnalyses[id], plan: "free" };
  }
  const fixtureId = Number(id);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) return null;

  const supabase = createServerClient();
  const { user, plan } = await getCurrentSession();
  if (!user) {
    redirect(`/entrar?returnTo=/match/${id}`);
  }

  // Has the user already viewed this fixture? If yes, don't count it again
  // against the free daily quota — re-opening from history is free.
  const { data: prior } = await supabase
    .from("user_analyses")
    .select("id")
    .eq("user_id", user.id)
    .eq("fixture_id", fixtureId)
    .limit(1)
    .maybeSingle();
  const isRevisit = !!prior;

  if (plan === "free" && !isRevisit) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await supabase
      .from("daily_usage")
      .select("analyses_count")
      .eq("user_id", user.id)
      .eq("day", today)
      .maybeSingle();
    const used = usage?.analyses_count ?? 0;
    if (used >= FREE_DAILY_LIMIT) {
      return { kind: "limit", planInfo: PLANS.monthly };
    }
  }

  try {
    const result = await getOrCreateAnalysis(fixtureId);
    if (plan === "free" && !isRevisit) {
      try {
        await serviceRoleClient().rpc("increment_daily_usage", {
          target_user: user.id,
        });
      } catch {
        /* fail open */
      }
    }
    // Always log a fresh view row so the "Visto há X" label updates.
    await recordUserView(user.id, fixtureId, result.payload, result.ai);
    return {
      kind: "ok",
      analysis: mapAnalysisToMatchAnalysis(result.payload, result.ai),
      plan,
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
        {result.kind === "limit" ? (
          <DailyLimitCard />
        ) : (
          <div className="flex flex-col gap-6">
            <MatchHeader analysis={result.analysis} />
            <AISummary
              summary={result.analysis.aiSummary}
              confidence={result.analysis.confidence}
            />
            <BetsSection bets={result.analysis.bets} plan={result.plan} />
            <MatchStats
              stats={result.analysis.stats}
              homeTeam={result.analysis.homeTeam}
              awayTeam={result.analysis.awayTeam}
            />
          </div>
        )}
      </main>

      <BottomNavBar />
    </>
  );
}

function DailyLimitCard() {
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
        Limite atingido
      </span>
      <h2 className="font-display-lg text-[26px] leading-tight text-on-surface mb-2 tracking-tight">
        Já usaste as duas
        <br />
        análises de hoje
      </h2>
      <p className="font-body-md text-[14px] text-on-surface-variant mb-6 max-w-[300px]">
        Volta amanhã ou desbloqueia análises ilimitadas com baixo, médio e alto
        risco em todos os jogos.
      </p>

      <div className="glass-card rounded-2xl p-5 w-full text-left mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-md text-label-md uppercase tracking-wider text-primary-container">
            Mensal · Mais escolhido
          </span>
          <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">
            30 dias
          </span>
        </div>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="font-display-lg text-[36px] text-on-surface leading-none">
            5.000
          </span>
          <span className="font-headline-md text-[14px] text-on-surface-variant">
            Kz
          </span>
        </div>
        <ul className="flex flex-col gap-2 mb-1">
          {[
            "Análises ilimitadas",
            "As 3 sugestões em todos os jogos",
            "Histórico completo guardado",
          ].map((p) => (
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

      <Link
        href="/perfil"
        className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_20px_rgba(255,107,0,0.4)] flex items-center justify-center gap-2"
      >
        Ver planos
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </Link>

      <Link
        href="/"
        className="mt-3 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
      >
        Voltar ao início
      </Link>
    </section>
  );
}
