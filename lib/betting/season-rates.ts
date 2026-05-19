import type {
  ApiFixture,
  ApiTeamStatistics,
} from "@/lib/api-football/types";

/**
 * Recompute team season averages from raw fixtures, **respecting an `asOf`
 * cut-off** so the model never sees results from after that date.
 *
 * Why we need this:
 *
 *   /teams/statistics on API-Football returns the season aggregate at the
 *   moment of the call. When we backtest a fixture from 60 days ago, those
 *   stats already include the result we're trying to predict — that's data
 *   leakage. For live (pre-match) usage it doesn't matter, but for honest
 *   evaluation we need to rebuild the same numbers using only past games.
 *
 *   This module produces the same shape as /teams/statistics for the fields
 *   we actually use in features.ts (home/away/total averages, played counts,
 *   clean sheets, failed-to-score, form string, goals-by-minute is left as
 *   the original API response since we don't have minute data per fixture).
 *
 * Inputs:
 *   - allTeamFixtures: ALL the team's matches in the season we want to
 *     summarise (typically obtained via /fixtures?team=...&season=...).
 *   - leagueId, season: filter to keep only matches in the same competition.
 *   - asOf: cut-off date — fixtures on/after this are excluded.
 *   - fallback: the live /teams/statistics response, used to fill in
 *     fields we can't reconstruct (mostly the goals-by-minute distribution,
 *     which is a season-wide percentage that doesn't drift fast).
 */
export function rebuildSeasonStats(args: {
  allTeamFixtures: ApiFixture[];
  leagueId: number;
  season: number;
  teamId: number;
  asOf: Date;
  fallback: ApiTeamStatistics | null;
}): ApiTeamStatistics | null {
  const cut = args.asOf.getTime();
  const inWindow = args.allTeamFixtures.filter(
    (f) =>
      f.league.id === args.leagueId &&
      f.league.season === args.season &&
      f.fixture.status.short === "FT" &&
      f.fixture.timestamp * 1000 < cut &&
      f.goals.home != null &&
      f.goals.away != null,
  );

  if (inWindow.length === 0) return args.fallback ?? null;

  let homePlayed = 0,
    homeWins = 0,
    homeDraws = 0,
    homeLoses = 0,
    homeGoalsFor = 0,
    homeGoalsAgainst = 0,
    homeCleanSheets = 0,
    homeFailedToScore = 0;
  let awayPlayed = 0,
    awayWins = 0,
    awayDraws = 0,
    awayLoses = 0,
    awayGoalsFor = 0,
    awayGoalsAgainst = 0,
    awayCleanSheets = 0,
    awayFailedToScore = 0;

  for (const f of inWindow) {
    const isHome = f.teams.home.id === args.teamId;
    const goalsFor = isHome ? f.goals.home! : f.goals.away!;
    const goalsAgainst = isHome ? f.goals.away! : f.goals.home!;
    const won =
      (isHome && goalsFor > goalsAgainst) ||
      (!isHome && goalsFor > goalsAgainst);
    const draw = goalsFor === goalsAgainst;

    if (isHome) {
      homePlayed++;
      homeGoalsFor += goalsFor;
      homeGoalsAgainst += goalsAgainst;
      if (won) homeWins++;
      else if (draw) homeDraws++;
      else homeLoses++;
      if (goalsAgainst === 0) homeCleanSheets++;
      if (goalsFor === 0) homeFailedToScore++;
    } else {
      awayPlayed++;
      awayGoalsFor += goalsFor;
      awayGoalsAgainst += goalsAgainst;
      if (won) awayWins++;
      else if (draw) awayDraws++;
      else awayLoses++;
      if (goalsAgainst === 0) awayCleanSheets++;
      if (goalsFor === 0) awayFailedToScore++;
    }
  }

  const totalPlayed = homePlayed + awayPlayed;
  const totalWins = homeWins + awayWins;
  const totalDraws = homeDraws + awayDraws;
  const totalLoses = homeLoses + awayLoses;
  const totalGoalsFor = homeGoalsFor + awayGoalsFor;
  const totalGoalsAgainst = homeGoalsAgainst + awayGoalsAgainst;

  const avg = (sum: number, n: number) => (n > 0 ? sum / n : 0);
  const fmt = (n: number) => n.toFixed(2);

  // Form string: most recent N matches (ascending → ending with the most recent).
  const recent = inWindow
    .slice()
    .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
    .slice(-10)
    .map((f) => {
      const isHome = f.teams.home.id === args.teamId;
      const gf = isHome ? f.goals.home! : f.goals.away!;
      const ga = isHome ? f.goals.away! : f.goals.home!;
      if (gf > ga) return "W";
      if (gf < ga) return "L";
      return "D";
    })
    .join("");

  // Preserve fields we can't safely recompute from headline fixtures only:
  // - goals.for.minute (per-15-minute distribution)
  // - league metadata
  // - team metadata
  // We carry them from `fallback` if available, otherwise stub.
  const team = args.fallback?.team ?? { id: args.teamId, name: "", logo: "" };
  const league =
    args.fallback?.league ??
    ({
      id: args.leagueId,
      name: "",
      country: "",
      logo: "",
      season: args.season,
      round: "",
    });
  const minuteFor = args.fallback?.goals.for.minute ?? {};
  const minuteAgainst = args.fallback?.goals.against.minute ?? {};

  return {
    league,
    team,
    fixtures: {
      played: { home: homePlayed, away: awayPlayed, total: totalPlayed },
      wins: { home: homeWins, away: awayWins, total: totalWins },
      draws: { home: homeDraws, away: awayDraws, total: totalDraws },
      loses: { home: homeLoses, away: awayLoses, total: totalLoses },
    },
    goals: {
      for: {
        total: { home: homeGoalsFor, away: awayGoalsFor, total: totalGoalsFor },
        average: {
          home: fmt(avg(homeGoalsFor, homePlayed)),
          away: fmt(avg(awayGoalsFor, awayPlayed)),
          total: fmt(avg(totalGoalsFor, totalPlayed)),
        },
        minute: minuteFor,
      },
      against: {
        total: {
          home: homeGoalsAgainst,
          away: awayGoalsAgainst,
          total: totalGoalsAgainst,
        },
        average: {
          home: fmt(avg(homeGoalsAgainst, homePlayed)),
          away: fmt(avg(awayGoalsAgainst, awayPlayed)),
          total: fmt(avg(totalGoalsAgainst, totalPlayed)),
        },
        minute: minuteAgainst,
      },
    },
    clean_sheet: {
      home: homeCleanSheets,
      away: awayCleanSheets,
      total: homeCleanSheets + awayCleanSheets,
    },
    failed_to_score: {
      home: homeFailedToScore,
      away: awayFailedToScore,
      total: homeFailedToScore + awayFailedToScore,
    },
    form: recent,
  };
}
