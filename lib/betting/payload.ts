import type { FixtureContext } from "@/lib/api-football/queries";
import type { Features } from "./features";
import type { ProbabilityMap } from "./types";

/**
 * Builds the JSON payload sent to ChatGPT.
 *
 * Goals:
 *   - Self-contained (the IA shouldn't need to call the API).
 *   - Deterministic (same fixture + same data → same payload).
 *   - Compact (under ~6k tokens) so we can use cheaper models.
 *
 * The IA's job is then to:
 *   1. Read this payload.
 *   2. Pick 3 markets (low / medium / high risk) from `markets`.
 *   3. Write rationale text in pt-BR using the plain-language `notes`,
 *      `homeFormNotes`, `awayFormNotes` — never citing math jargon.
 *
 * The IA does NOT recompute probabilities — it only ranks/selects.
 */

export type AnalysisPayload = {
  fixture: {
    id: number;
    league: string;
    country: string;
    season: number;
    round: string;
    kickoff: string;
    status: string;
    venue: string | null;
    referee: string | null;
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  // Probability container — internal numeric features needed by the IA but
  // it's instructed to never quote them verbatim.
  features: {
    confidence: number;
    formWeight: number;
    h2hAdjust: number;
    homeTrend: -1 | 0 | 1;
    awayTrend: -1 | 0 | 1;
  };
  /** Plain-language notes the IA can rephrase in user-facing text. */
  narrative: {
    matchContext: string[];
    homeForm: string[];
    awayForm: string[];
    headToHead: string[];
  };
  history: {
    h2h: {
      played: number;
      avgGoals: number;
      homeWins: number;
      awayWins: number;
      draws: number;
    } | null;
    homeSeason: SeasonSummary | null;
    awaySeason: SeasonSummary | null;
    homeForm: FormSummary;
    awayForm: FormSummary;
  };
  markets: {
    key: string;
    label: string;
    category: string;
    probability: number;
  }[];
};

type SeasonSummary = {
  played: number;
  wins: number;
  draws: number;
  loses: number;
  goalsForAvg: number;
  goalsAgainstAvg: number;
  cleanSheets: number;
  failedToScore: number;
};

type FormSummary = {
  played: number;
  wins: number;
  draws: number;
  loses: number;
  goalsFor: number;
  goalsAgainst: number;
  vsTopHalf: { played: number; goalsFor: number; goalsAgainst: number } | null;
};

function summarizeH2H(ctx: FixtureContext) {
  if (ctx.h2h.length === 0) return null;
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let goals = 0;
  const homeId = ctx.fixture.teams.home.id;
  for (const f of ctx.h2h) {
    const hg = f.goals.home ?? 0;
    const ag = f.goals.away ?? 0;
    goals += hg + ag;
    const winnerHome = f.teams.home.winner === true;
    const winnerAway = f.teams.away.winner === true;
    if (!winnerHome && !winnerAway) {
      draws += 1;
    } else {
      const homeIsCurrentHome = f.teams.home.id === homeId;
      const homeTeamWon = winnerHome ? homeIsCurrentHome : !homeIsCurrentHome;
      if (homeTeamWon) homeWins += 1;
      else awayWins += 1;
    }
  }
  return {
    played: ctx.h2h.length,
    avgGoals: +(goals / ctx.h2h.length).toFixed(2),
    homeWins,
    awayWins,
    draws,
  };
}

function summarizeSeason(stats: FixtureContext["homeStats"]): SeasonSummary | null {
  if (!stats) return null;
  return {
    played: stats.fixtures.played.total,
    wins: stats.fixtures.wins.total,
    draws: stats.fixtures.draws.total,
    loses: stats.fixtures.loses.total,
    goalsForAvg: +parseFloat(stats.goals.for.average.total).toFixed(2),
    goalsAgainstAvg: +parseFloat(stats.goals.against.average.total).toFixed(2),
    cleanSheets: stats.clean_sheet.total,
    failedToScore: stats.failed_to_score.total,
  };
}

function buildH2HNotes(
  h2h: ReturnType<typeof summarizeH2H>,
  homeName: string,
  awayName: string,
): string[] {
  if (!h2h) return [];
  const lines: string[] = [];
  lines.push(
    `Últimos ${h2h.played} confrontos diretos: ${h2h.homeWins} vitórias do ${homeName}, ${h2h.draws} empates, ${h2h.awayWins} vitórias do ${awayName}.`,
  );
  lines.push(`Média de ${h2h.avgGoals.toFixed(1)} golos por jogo nesses encontros.`);
  return lines;
}

export function buildAnalysisPayload(
  ctx: FixtureContext,
  features: Features,
  markets: ProbabilityMap,
): AnalysisPayload {
  const fx = ctx.fixture;
  const h2h = summarizeH2H(ctx);
  const homeForm = features.intermediate.homeForm;
  const awayForm = features.intermediate.awayForm;

  return {
    fixture: {
      id: fx.fixture.id,
      league: fx.league.name,
      country: fx.league.country,
      season: fx.league.season,
      round: fx.league.round,
      kickoff: fx.fixture.date,
      status: fx.fixture.status.long,
      venue: fx.fixture.venue.name,
      referee: fx.fixture.referee,
    },
    teams: {
      home: { id: fx.teams.home.id, name: fx.teams.home.name, logo: fx.teams.home.logo },
      away: { id: fx.teams.away.id, name: fx.teams.away.name, logo: fx.teams.away.logo },
    },
    features: {
      confidence: +features.confidence.toFixed(2),
      formWeight: +features.intermediate.weightForm.toFixed(2),
      h2hAdjust: +features.intermediate.h2hAdjust.toFixed(2),
      homeTrend: homeForm.trend,
      awayTrend: awayForm.trend,
    },
    narrative: {
      matchContext: features.notes,
      homeForm: features.homeFormNotes,
      awayForm: features.awayFormNotes,
      headToHead: buildH2HNotes(h2h, fx.teams.home.name, fx.teams.away.name),
    },
    history: {
      h2h,
      homeSeason: summarizeSeason(ctx.homeStats),
      awaySeason: summarizeSeason(ctx.awayStats),
      homeForm: {
        played: homeForm.games.length,
        wins: homeForm.wins,
        draws: homeForm.draws,
        loses: homeForm.loses,
        goalsFor: homeForm.games.reduce((s, g) => s + g.goalsFor, 0),
        goalsAgainst: homeForm.games.reduce((s, g) => s + g.goalsAgainst, 0),
        vsTopHalf: homeForm.vsTopHalf,
      },
      awayForm: {
        played: awayForm.games.length,
        wins: awayForm.wins,
        draws: awayForm.draws,
        loses: awayForm.loses,
        goalsFor: awayForm.games.reduce((s, g) => s + g.goalsFor, 0),
        goalsAgainst: awayForm.games.reduce((s, g) => s + g.goalsAgainst, 0),
        vsTopHalf: awayForm.vsTopHalf,
      },
    },
    markets: Object.values(markets)
      .map((m) => ({
        key: m.key,
        label: m.label,
        category: m.category,
        probability: +m.probability.toFixed(4),
      }))
      .sort((a, b) => b.probability - a.probability),
  };
}
