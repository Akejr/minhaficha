import type { ApiTeamStatistics } from "@/lib/api-football/types";

/**
 * Maher (1982) / Dixon-Coles (1997) attack-defence strength estimation.
 *
 * Definitions (using the season-aggregated home/away splits the API gives us):
 *
 *   leagueGoalsHomeLeg = avg goals scored BY home teams in this league
 *   leagueGoalsAwayLeg = avg goals scored BY away teams in this league
 *
 *   homeAtt = (home goals scored at home per match) / leagueGoalsHomeLeg
 *   awayAtt = (away goals scored away per match) / leagueGoalsAwayLeg
 *
 *   homeDef = (home goals conceded at home per match) / leagueGoalsAwayLeg
 *   awayDef = (away goals conceded away per match) / leagueGoalsHomeLeg
 *
 * Predicted rates:
 *
 *   λH = homeAtt × awayDef × leagueGoalsHomeLeg
 *   λA = awayAtt × homeDef × leagueGoalsAwayLeg
 *
 * The "× leagueGoalsXLeg" factor IS the home-field advantage — it's baked
 * into the league split, so we don't add a separate multiplier.
 *
 * The API doesn't expose the league-wide averages directly, so we estimate
 * them from the home/away splits of the two teams we DO have. Two-team
 * averages are noisy but unbiased; we shrink toward a sane prior to
 * stabilise the small-sample case.
 */

const PRIOR_LEAGUE_GOALS_HOME = 1.50;
const PRIOR_LEAGUE_GOALS_AWAY = 1.20;

/** How strongly we shrink toward the prior. Higher = trust our 2-team sample less. */
const SHRINK_K = 12;

function safeNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export type LeaguePrior = {
  goalsHomeLeg: number;
  goalsAwayLeg: number;
  source: "shrunk-from-teams" | "prior-only";
};

/**
 * Estimate league-wide home/away goal averages from whatever team data we have.
 *
 *   shrunkAvg = (Σ obs + k · prior) / (n + k)
 *
 * where n is the matches-played sample and k is the shrinkage strength.
 */
export function estimateLeaguePrior(
  homeStats: ApiTeamStatistics | null,
  awayStats: ApiTeamStatistics | null,
): LeaguePrior {
  const samples: { home: number; away: number; n: number }[] = [];

  if (homeStats) {
    const nHome = homeStats.fixtures.played.home;
    const nAway = homeStats.fixtures.played.away;
    samples.push({
      home: safeNum(homeStats.goals.for.average.home),
      away: safeNum(homeStats.goals.for.average.away),
      n: Math.min(nHome, nAway),
    });
  }
  if (awayStats) {
    const nHome = awayStats.fixtures.played.home;
    const nAway = awayStats.fixtures.played.away;
    samples.push({
      home: safeNum(awayStats.goals.for.average.home),
      away: safeNum(awayStats.goals.for.average.away),
      n: Math.min(nHome, nAway),
    });
  }

  if (samples.length === 0) {
    return {
      goalsHomeLeg: PRIOR_LEAGUE_GOALS_HOME,
      goalsAwayLeg: PRIOR_LEAGUE_GOALS_AWAY,
      source: "prior-only",
    };
  }

  const totalN = samples.reduce((s, x) => s + x.n, 0);
  const sumHome = samples.reduce((s, x) => s + x.home * x.n, 0);
  const sumAway = samples.reduce((s, x) => s + x.away * x.n, 0);

  const goalsHomeLeg =
    (sumHome + SHRINK_K * PRIOR_LEAGUE_GOALS_HOME) / (totalN + SHRINK_K);
  const goalsAwayLeg =
    (sumAway + SHRINK_K * PRIOR_LEAGUE_GOALS_AWAY) / (totalN + SHRINK_K);

  return { goalsHomeLeg, goalsAwayLeg, source: "shrunk-from-teams" };
}

export type TeamSeasonRates = {
  /** Goals scored at home per home match. */
  forHomeLeg: number;
  /** Goals scored away per away match. */
  forAwayLeg: number;
  /** Goals conceded at home per home match. */
  againstHomeLeg: number;
  /** Goals conceded away per away match. */
  againstAwayLeg: number;
  /** Sample size on the relevant leg (home matches if this team plays home). */
  matchesHomeLeg: number;
  matchesAwayLeg: number;
};

export function teamSeasonRates(stats: ApiTeamStatistics | null): TeamSeasonRates | null {
  if (!stats) return null;
  return {
    forHomeLeg: safeNum(stats.goals.for.average.home),
    forAwayLeg: safeNum(stats.goals.for.average.away),
    againstHomeLeg: safeNum(stats.goals.against.average.home),
    againstAwayLeg: safeNum(stats.goals.against.average.away),
    matchesHomeLeg: stats.fixtures.played.home,
    matchesAwayLeg: stats.fixtures.played.away,
  };
}

export type Strengths = {
  homeAtt: number;
  awayAtt: number;
  homeDef: number;
  awayDef: number;
};

/**
 * Compute Att/Def strengths normalised to league averages, with shrinkage
 * toward neutral (1.0) when the team has played few matches.
 *
 *   strength = (raw + k) / (n_matches + k) ... no — see formula below
 *
 * Simpler shrinkage: weight = n / (n + k); strength = weight·raw + (1-weight)·1.0
 */
export function computeStrengths(
  home: TeamSeasonRates,
  away: TeamSeasonRates,
  prior: LeaguePrior,
  shrinkageK = 6,
): Strengths {
  const shrink = (raw: number, n: number) => {
    const w = n / (n + shrinkageK);
    return w * raw + (1 - w) * 1;
  };

  const homeAttRaw = home.forHomeLeg / prior.goalsHomeLeg;
  const awayAttRaw = away.forAwayLeg / prior.goalsAwayLeg;
  const homeDefRaw = home.againstHomeLeg / prior.goalsAwayLeg;
  const awayDefRaw = away.againstAwayLeg / prior.goalsHomeLeg;

  return {
    homeAtt: shrink(homeAttRaw, home.matchesHomeLeg),
    awayAtt: shrink(awayAttRaw, away.matchesAwayLeg),
    homeDef: shrink(homeDefRaw, home.matchesHomeLeg),
    awayDef: shrink(awayDefRaw, away.matchesAwayLeg),
  };
}

/**
/**
 * Compute λ from strengths and league prior:
 *
 *   λH = homeAtt × awayDef × leagueGoalsHomeLeg
 *   λA = awayAtt × homeDef × leagueGoalsAwayLeg
 */
export function lambdasFromStrengths(
  strengths: Strengths,
  prior: LeaguePrior,
): { lambdaHome: number; lambdaAway: number } {
  return {
    lambdaHome: strengths.homeAtt * strengths.awayDef * prior.goalsHomeLeg,
    lambdaAway: strengths.awayAtt * strengths.homeDef * prior.goalsAwayLeg,
  };
}
