import type { ApiFixture, ApiTeamStatistics } from "@/lib/api-football/types";
import type { FixtureContext } from "@/lib/api-football/queries";
import {
  computeStrengths,
  estimateLeaguePrior,
  lambdasFromStrengths,
  teamSeasonRates,
  type LeaguePrior,
  type Strengths,
} from "./strengths";
import {
  analyseForm,
  buildStrengthMap,
  type FormReport,
} from "./form-analysis";
import { computeContextAdjustment } from "./context-adjustments";

/**
 * Pre-match feature extraction for one fixture.
 *
 * Pipeline (no live data used):
 *
 *   1. Estimate league home/away goal averages (with shrinkage to a prior).
 *   2. Compute Att/Def strengths from full-season stats.
 *   3. Derive baseline λ from strengths (Maher / Dixon-Coles).
 *   4. Independently analyse each team's last 10 games:
 *      - quality-adjust goals by opponent strength (using standings tiers)
 *      - detect trend (last 5 vs previous 5)
 *      - bucket by opponent tier (top / mid / bottom)
 *   5. Blend baseline λ with form-based λ (weight grows with sample size, capped).
 *   6. Apply trend bonus / penalty (±5%).
 *   7. Apply H2H total-goals adjustment, regularised to ±10%.
 *   8. Estimate λ_corners and the 1st-half goal share.
 *
 * Returns Features ready to plug into market models AND human-readable
 * `notes` that the IA uses to write its analysis without exposing math.
 */

export type Features = {
  lambdaHome: number;
  lambdaAway: number;
  lambdaCorners: number;
  rho: number;
  firstHalfShare: number;
  homeFirstGoalShare: number;
  confidence: number;
  notes: string[];
  /** Plain-language form summary for each team — passed straight to the IA. */
  homeFormNotes: string[];
  awayFormNotes: string[];
  intermediate: {
    leaguePrior: LeaguePrior;
    strengths: Strengths | null;
    seasonLambdas: { lambdaHome: number; lambdaAway: number } | null;
    homeForm: FormReport;
    awayForm: FormReport;
    weightForm: number;
    h2hAdjust: number;
    trendAdjustHome: number;
    trendAdjustAway: number;
  };
};

const LEAGUE_AVG_CORNERS_TOTAL = 10.2;
const FIRST_HALF_SHARE_DEFAULT = 0.45;
const RHO_DEFAULT = -0.15;

const LAMBDA_MIN = 0.15;
const LAMBDA_MAX = 4.5;

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function safeNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** H2H: regress to the season-implied total, ±10% cap. */
function h2hGoalsAdjust(
  h2hFixtures: ApiFixture[],
  seasonImpliedTotal: number,
): { factor: number; note?: string } {
  if (h2hFixtures.length < 3) return { factor: 1 };
  const total =
    h2hFixtures.reduce(
      (s, f) => s + (f.goals.home ?? 0) + (f.goals.away ?? 0),
      0,
    ) / h2hFixtures.length;

  const ratio = total / Math.max(seasonImpliedTotal, 0.5);
  const factor = clamp(ratio, 0.9, 1.1);
  return {
    factor,
    note: `Confrontos diretos: média de ${total.toFixed(1)} gols por jogo nos últimos ${h2hFixtures.length} confrontos.`,
  };
}

/** Heuristic corners ∝ goals (until we wire per-team corner stats). */
function estimateCorners(_ctx: FixtureContext, lambdaTotalGoals: number): number {
  const leagueGoals = 2.7;
  const ratio = lambdaTotalGoals / leagueGoals;
  return clamp(LEAGUE_AVG_CORNERS_TOTAL * ratio, 6.5, 14);
}

/** First-half share from the goals-by-minute distribution returned by the API. */
function estimateFirstHalfShare(
  homeStats: ApiTeamStatistics | null,
  awayStats: ApiTeamStatistics | null,
): { share: number; note?: string } {
  const firstHalfBins = ["0-15", "16-30", "31-45"];

  const sumShareForTeam = (
    stats: ApiTeamStatistics | null,
  ): number | null => {
    if (!stats) return null;
    let total = 0;
    let firstHalf = 0;
    let seenAny = false;
    for (const [bin, info] of Object.entries(stats.goals.for.minute)) {
      const pct = safeNum(info.percentage);
      if (pct > 0) {
        seenAny = true;
        total += pct;
        if (firstHalfBins.includes(bin)) firstHalf += pct;
      }
    }
    if (!seenAny || total <= 0) return null;
    return firstHalf / total;
  };

  const shares = [sumShareForTeam(homeStats), sumShareForTeam(awayStats)].filter(
    (x): x is number => x != null,
  );
  if (shares.length === 0) return { share: FIRST_HALF_SHARE_DEFAULT };
  const avg = shares.reduce((s, x) => s + x, 0) / shares.length;
  const share = clamp(avg, 0.30, 0.55);
  return {
    share,
    note: `Padrão de gols: ${(share * 100).toFixed(0)}% saem no 1º tempo (média dos dois times nesta temporada).`,
  };
}

function computeConfidence(args: {
  hasHomeStats: boolean;
  hasAwayStats: boolean;
  homeFormSize: number;
  awayFormSize: number;
  h2hCount: number;
  hasStandings: boolean;
}): number {
  let score = 0.30;
  if (args.hasHomeStats) score += 0.18;
  if (args.hasAwayStats) score += 0.18;
  score += clamp(args.homeFormSize / 10, 0, 0.10);
  score += clamp(args.awayFormSize / 10, 0, 0.10);
  if (args.h2hCount >= 3) score += 0.05;
  if (args.hasStandings) score += 0.05;
  return clamp(score, 0.20, 0.95);
}

/**
 * Convert "form attack rate" into a pseudo-λ that mixes attack of one team
 * with defence of the other. Used for the form-blended λ.
 */
function lambdaFromForm(
  attackerForm: FormReport,
  defenderForm: FormReport,
  prior: LeaguePrior,
): number {
  // Halfway between attack-rate (q-adjusted goals scored) and what the
  // defender typically concedes. Anchored to the league prior for stability.
  if (attackerForm.games.length === 0 || defenderForm.games.length === 0) {
    return (prior.goalsHomeLeg + prior.goalsAwayLeg) / 2;
  }
  return (attackerForm.attackRate + defenderForm.defenceRate) / 2;
}

export function extractFeatures(ctx: FixtureContext): Features {
  const notes: string[] = [];

  const leaguePrior = estimateLeaguePrior(ctx.homeStats, ctx.awayStats);
  notes.push(
    `Liga: ${ctx.fixture.league.name}. Jogando em casa, o mandante marca em média ${leaguePrior.goalsHomeLeg.toFixed(2)} gols; os visitantes marcam ${leaguePrior.goalsAwayLeg.toFixed(2)}.`,
  );

  // Att/Def strengths and season-implied λ.
  const homeRates = teamSeasonRates(ctx.homeStats);
  const awayRates = teamSeasonRates(ctx.awayStats);

  let strengths: Strengths | null = null;
  let seasonLambdas: { lambdaHome: number; lambdaAway: number } | null = null;

  if (homeRates && awayRates) {
    strengths = computeStrengths(homeRates, awayRates, leaguePrior);
    seasonLambdas = lambdasFromStrengths(strengths, leaguePrior);
  } else {
    seasonLambdas = {
      lambdaHome: leaguePrior.goalsHomeLeg,
      lambdaAway: leaguePrior.goalsAwayLeg,
    };
    notes.push(
      "Sem estatísticas completas da temporada — análise baseada na média da liga.",
    );
  }

  // Recent form — quality-adjusted by standings tier.
  const strengthMap = buildStrengthMap(ctx.standings);
  const homeForm = analyseForm(ctx.homeRecent, ctx.fixture.teams.home.id, strengthMap);
  const awayForm = analyseForm(ctx.awayRecent, ctx.fixture.teams.away.id, strengthMap);

  const lambdaHomeForm = lambdaFromForm(homeForm, awayForm, leaguePrior);
  const lambdaAwayForm = lambdaFromForm(awayForm, homeForm, leaguePrior);

  // Blend: weight on form grows with sample, capped at 45%.
  const formSample = Math.min(homeForm.games.length, awayForm.games.length);
  const weightForm = clamp(formSample / 12, 0, 0.45);
  let lambdaHome =
    (1 - weightForm) * seasonLambdas.lambdaHome + weightForm * lambdaHomeForm;
  let lambdaAway =
    (1 - weightForm) * seasonLambdas.lambdaAway + weightForm * lambdaAwayForm;

  // Trend bonus: ±5% per team based on whether they're rising or falling.
  const trendAdjustHome = 1 + 0.05 * homeForm.trend;
  const trendAdjustAway = 1 + 0.05 * awayForm.trend;
  lambdaHome *= trendAdjustHome;
  lambdaAway *= trendAdjustAway;

  // H2H goal-volume adjustment.
  const seasonTotal = lambdaHome + lambdaAway;
  const h2h = h2hGoalsAdjust(ctx.h2h, seasonTotal);
  lambdaHome *= h2h.factor;
  lambdaAway *= h2h.factor;
  if (h2h.note) notes.push(h2h.note);

  // Context: injuries + rest days.
  const ctxAdjust = computeContextAdjustment({
    fixture: ctx.fixture,
    homeRecent: ctx.homeRecent,
    awayRecent: ctx.awayRecent,
    homeInjuries: ctx.homeInjuries ?? [],
    awayInjuries: ctx.awayInjuries ?? [],
  });
  lambdaHome *= ctxAdjust.homeLambdaFactor;
  lambdaAway *= ctxAdjust.awayLambdaFactor;
  for (const n of ctxAdjust.notes) notes.push(n);

  // Sanity bounds.
  lambdaHome = clamp(lambdaHome, LAMBDA_MIN, LAMBDA_MAX);
  lambdaAway = clamp(lambdaAway, LAMBDA_MIN, LAMBDA_MAX);

  // First-half share + corners.
  const firstHalf = estimateFirstHalfShare(ctx.homeStats, ctx.awayStats);
  if (firstHalf.note) notes.push(firstHalf.note);

  const lambdaCorners = estimateCorners(ctx, lambdaHome + lambdaAway);

  // First-goal share.
  const totalLambda = lambdaHome + lambdaAway;
  const homeFirstGoalShare = totalLambda > 0 ? lambdaHome / totalLambda : 0.5;

  const confidence = computeConfidence({
    hasHomeStats: !!ctx.homeStats,
    hasAwayStats: !!ctx.awayStats,
    homeFormSize: homeForm.games.length,
    awayFormSize: awayForm.games.length,
    h2hCount: ctx.h2h.length,
    hasStandings: !!ctx.standings,
  });

  return {
    lambdaHome,
    lambdaAway,
    lambdaCorners,
    rho: RHO_DEFAULT,
    firstHalfShare: firstHalf.share,
    homeFirstGoalShare,
    confidence,
    notes,
    homeFormNotes: homeForm.notes,
    awayFormNotes: awayForm.notes,
    intermediate: {
      leaguePrior,
      strengths,
      seasonLambdas,
      homeForm,
      awayForm,
      weightForm,
      h2hAdjust: h2h.factor,
      trendAdjustHome,
      trendAdjustAway,
    },
  };
}
