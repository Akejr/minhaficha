import type {
  ApiFixture,
  ApiStandingsResponse,
} from "@/lib/api-football/types";

/**
 * Deep analysis of a team's last N fixtures, weighting goals by the
 * strength of each opponent (using the league standings table) and
 * detecting trend (last 5 vs previous 5).
 *
 * The output is consumed by features.ts (to fine-tune λ) AND included
 * in the IA prompt as plain-language notes.
 */

export type OpponentTier = "top" | "mid" | "bottom";

export type GameAnalysis = {
  fixtureId: number;
  date: string;
  isHome: boolean;
  opponentName: string;
  opponentTier: OpponentTier;
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
  /** Quality-adjusted goals scored (multiplier applied based on opponent strength). */
  qualityAdjustedGoalsFor: number;
  qualityAdjustedGoalsAgainst: number;
};

export type FormReport = {
  /** Last N games most-recent-first. */
  games: GameAnalysis[];
  /** Plain-language stat lines for the prompt. */
  notes: string[];
  /** Numeric output: λ contributions split by attack and defence, quality-adjusted. */
  attackRate: number; // average q-adjusted goals scored per game
  defenceRate: number; // average q-adjusted goals conceded per game
  /** Trend indicator: -1 (declining), 0 (stable), +1 (rising). */
  trend: -1 | 0 | 1;
  /** vs top-half opponents only (small sample, may be null). */
  vsTopHalf: { played: number; goalsFor: number; goalsAgainst: number } | null;
  /** Wins/draws/losses in the window. */
  wins: number;
  draws: number;
  loses: number;
};

/**
 * Build a quick lookup: teamId → strength tier based on the standings.
 *
 * Tier definition (within a single-table league):
 *   - top: rank ≤ 33% of teams
 *   - bottom: rank ≥ 66% of teams
 *   - mid: everything in between
 *
 * For tournaments with group standings (CL, Libertadores), every group is
 * normalised against its own size.
 */
export function buildStrengthMap(
  standings: ApiStandingsResponse | null,
): Map<number, OpponentTier> {
  const map = new Map<number, OpponentTier>();
  if (!standings) return map;
  for (const group of standings.league.standings) {
    const total = group.length || 1;
    for (const row of group) {
      const ratio = row.rank / total;
      const tier: OpponentTier =
        ratio <= 0.34 ? "top" : ratio >= 0.67 ? "bottom" : "mid";
      map.set(row.team.id, tier);
    }
  }
  return map;
}

/**
 * Goal multiplier by opponent tier. A goal vs a top team is worth more,
 * a goal vs a bottom team is worth less. Symmetric for goals conceded
 * (conceding vs bottom team is "worse" than conceding vs top team).
 */
const ATTACK_MULTIPLIER: Record<OpponentTier, number> = {
  top: 1.25,
  mid: 1.0,
  bottom: 0.85,
};

const DEFENCE_MULTIPLIER: Record<OpponentTier, number> = {
  top: 0.85, // conceding vs top is "expected"
  mid: 1.0,
  bottom: 1.20, // conceding vs bottom is "bad"
};

function pickResult(g: ApiFixture, teamId: number): "W" | "D" | "L" {
  const isHome = g.teams.home.id === teamId;
  const winnerHome = g.teams.home.winner === true;
  const winnerAway = g.teams.away.winner === true;
  if (!winnerHome && !winnerAway) return "D";
  return (isHome && winnerHome) || (!isHome && winnerAway) ? "W" : "L";
}

/**
 * Build the full FormReport for a single team.
 *
 * @param fixtures last N played fixtures (any opponent, home or away)
 * @param teamId   the team we're analysing
 * @param strength teamId → tier map (optional — defaults to "mid" everywhere)
 */
export function analyseForm(
  fixtures: ApiFixture[],
  teamId: number,
  strength: Map<number, OpponentTier>,
): FormReport {
  const games: GameAnalysis[] = [];
  let wins = 0;
  let draws = 0;
  let loses = 0;
  let qaFor = 0;
  let qaAgainst = 0;

  let topPlayed = 0;
  let topFor = 0;
  let topAgainst = 0;

  for (const f of fixtures) {
    const isHome = f.teams.home.id === teamId;
    const opponentId = isHome ? f.teams.away.id : f.teams.home.id;
    const opponentName = isHome ? f.teams.away.name : f.teams.home.name;
    const goalsFor = isHome ? f.goals.home ?? 0 : f.goals.away ?? 0;
    const goalsAgainst = isHome ? f.goals.away ?? 0 : f.goals.home ?? 0;
    const result = pickResult(f, teamId);
    const tier: OpponentTier = strength.get(opponentId) ?? "mid";

    const qaG = goalsFor * ATTACK_MULTIPLIER[tier];
    const qaC = goalsAgainst * DEFENCE_MULTIPLIER[tier];

    qaFor += qaG;
    qaAgainst += qaC;

    if (result === "W") wins++;
    else if (result === "D") draws++;
    else loses++;

    if (tier === "top") {
      topPlayed++;
      topFor += goalsFor;
      topAgainst += goalsAgainst;
    }

    games.push({
      fixtureId: f.fixture.id,
      date: f.fixture.date,
      isHome,
      opponentName,
      opponentTier: tier,
      goalsFor,
      goalsAgainst,
      result,
      qualityAdjustedGoalsFor: qaG,
      qualityAdjustedGoalsAgainst: qaC,
    });
  }

  const n = games.length || 1;
  const attackRate = qaFor / n;
  const defenceRate = qaAgainst / n;

  // Trend: compare the most recent 5 to the previous 5 games.
  let trend: -1 | 0 | 1 = 0;
  if (games.length >= 6) {
    const newest = games.slice(0, 5);
    const older = games.slice(5, 10);
    const newPoints = newest.reduce(
      (s, g) => s + (g.result === "W" ? 3 : g.result === "D" ? 1 : 0),
      0,
    );
    const oldPoints = older.reduce(
      (s, g) => s + (g.result === "W" ? 3 : g.result === "D" ? 1 : 0),
      0,
    );
    const diff = newPoints - oldPoints;
    if (diff >= 4) trend = 1;
    else if (diff <= -4) trend = -1;
  }

  const notes = buildNotes({
    wins,
    draws,
    loses,
    games,
    attackRate,
    defenceRate,
    trend,
    topPlayed,
    topFor,
    topAgainst,
  });

  return {
    games,
    notes,
    attackRate,
    defenceRate,
    trend,
    vsTopHalf: topPlayed > 0 ? { played: topPlayed, goalsFor: topFor, goalsAgainst: topAgainst } : null,
    wins,
    draws,
    loses,
  };
}

function buildNotes(args: {
  wins: number;
  draws: number;
  loses: number;
  games: GameAnalysis[];
  attackRate: number;
  defenceRate: number;
  trend: -1 | 0 | 1;
  topPlayed: number;
  topFor: number;
  topAgainst: number;
}): string[] {
  const notes: string[] = [];
  const total = args.games.length;
  if (total === 0) return notes;

  notes.push(
    `Últimos ${total}: ${args.wins}V ${args.draws}E ${args.loses}D. Marcou em média ${avgScored(args.games).toFixed(1)} e sofreu ${avgConceded(args.games).toFixed(1)} por jogo.`,
  );

  // Tier breakdown.
  const byTier = bucketByTier(args.games);
  const tierLines: string[] = [];
  for (const tier of ["top", "mid", "bottom"] as const) {
    const list = byTier[tier];
    if (list.length === 0) continue;
    const w = list.filter((g) => g.result === "W").length;
    const d = list.filter((g) => g.result === "D").length;
    const l = list.filter((g) => g.result === "L").length;
    const tierLabel =
      tier === "top"
        ? "times da parte de cima da tabela"
        : tier === "bottom"
          ? "times da parte de baixo da tabela"
          : "times do meio da tabela";
    tierLines.push(`contra ${tierLabel}: ${w}V ${d}E ${l}D em ${list.length} jogos`);
  }
  if (tierLines.length > 0) notes.push(tierLines.join(" · "));

  // Trend note.
  if (args.trend === 1) {
    notes.push(
      "Tendência em alta: o time somou mais pontos nas últimas 5 rodadas do que nas 5 anteriores.",
    );
  } else if (args.trend === -1) {
    notes.push(
      "Tendência em queda: o time rendeu menos nas últimas 5 rodadas do que nas 5 anteriores.",
    );
  }

  // Streak detection (last consecutive results).
  const streak = currentStreak(args.games);
  if (streak.length >= 2) {
    const labelMap = { W: "vitória", D: "empate", L: "derrota" } as const;
    notes.push(
      `Vem de ${streak.length} ${labelMap[streak.type]}${streak.length > 1 ? "s" : ""} seguidas.`,
    );
  }

  return notes;
}

function avgScored(games: GameAnalysis[]) {
  if (games.length === 0) return 0;
  return games.reduce((s, g) => s + g.goalsFor, 0) / games.length;
}

function avgConceded(games: GameAnalysis[]) {
  if (games.length === 0) return 0;
  return games.reduce((s, g) => s + g.goalsAgainst, 0) / games.length;
}

function bucketByTier(games: GameAnalysis[]) {
  const out: Record<OpponentTier, GameAnalysis[]> = { top: [], mid: [], bottom: [] };
  for (const g of games) out[g.opponentTier].push(g);
  return out;
}

function currentStreak(games: GameAnalysis[]) {
  if (games.length === 0) return { type: "D" as "W" | "D" | "L", length: 0 };
  const first = games[0].result;
  let len = 1;
  for (let i = 1; i < games.length; i++) {
    if (games[i].result === first) len++;
    else break;
  }
  return { type: first, length: len };
}
