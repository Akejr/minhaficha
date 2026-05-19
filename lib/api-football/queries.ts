import { apiFootballGet } from "./client";
import type {
  ApiFixture,
  ApiH2HFixture,
  ApiInjury,
  ApiOdds,
  ApiStandingsResponse,
  ApiTeamStatistics,
} from "./types";

/** A single fixture by id. */
export async function getFixture(fixtureId: number): Promise<ApiFixture | null> {
  const list = await apiFootballGet<ApiFixture>(
    "/fixtures",
    { id: fixtureId },
    { revalidate: 60 },
  );
  return list[0] ?? null;
}

/** Last N played fixtures for a team. */
export async function getRecentFixtures(
  teamId: number,
  last = 10,
): Promise<ApiFixture[]> {
  return apiFootballGet<ApiFixture>(
    "/fixtures",
    { team: teamId, last },
    { revalidate: 600 },
  );
}

/** Aggregated team statistics for one league/season. */
export async function getTeamStatistics(args: {
  teamId: number;
  leagueId: number;
  season: number;
}): Promise<ApiTeamStatistics | null> {
  const list = await apiFootballGet<ApiTeamStatistics>(
    "/teams/statistics",
    {
      team: args.teamId,
      league: args.leagueId,
      season: args.season,
    },
    { revalidate: 1800 },
  );
  return list[0] ?? null;
}

/** Head-to-head history. */
export async function getHeadToHead(
  homeId: number,
  awayId: number,
  last = 10,
): Promise<ApiH2HFixture[]> {
  return apiFootballGet<ApiH2HFixture>(
    "/fixtures/headtohead",
    { h2h: `${homeId}-${awayId}`, last },
    { revalidate: 3600 },
  );
}

/** Bookmaker odds for the fixture (used as a sanity-check against our model). */
export async function getOdds(fixtureId: number): Promise<ApiOdds[]> {
  return apiFootballGet<ApiOdds>(
    "/odds",
    { fixture: fixtureId },
    { revalidate: 600 },
  );
}

/** League standings — used as a strength-of-schedule signal. */
export async function getStandings(
  leagueId: number,
  season: number,
): Promise<ApiStandingsResponse | null> {
  const list = await apiFootballGet<ApiStandingsResponse>(
    "/standings",
    { league: leagueId, season },
    { revalidate: 3600 },
  );
  return list[0] ?? null;
}

/**
 * Bundle every piece of pre-match data we need for one fixture analysis.
 * Calls run in parallel; partial failures are tolerated and the missing
 * slice is replaced with a safe default so we can still produce a
 * (lower-confidence) analysis.
 */
export async function fetchFixtureContext(fixtureId: number) {
  const fixture = await getFixture(fixtureId);
  if (!fixture) return null;

  const homeId = fixture.teams.home.id;
  const awayId = fixture.teams.away.id;
  const leagueId = fixture.league.id;
  const season = fixture.league.season;

  const [
    homeStats,
    awayStats,
    homeRecent,
    awayRecent,
    h2h,
    odds,
    standings,
    injuries,
  ] = await Promise.all([
    getTeamStatistics({ teamId: homeId, leagueId, season }).catch(() => null),
    getTeamStatistics({ teamId: awayId, leagueId, season }).catch(() => null),
    getRecentFixtures(homeId, 10).catch(() => []),
    getRecentFixtures(awayId, 10).catch(() => []),
    getHeadToHead(homeId, awayId, 10).catch(() => []),
    getOdds(fixtureId).catch(() => []),
    getStandings(leagueId, season).catch(() => null),
    getInjuries({ fixtureId }).catch(() => [] as ApiInjury[]),
  ]);

  const homeInjuries = injuries.filter((i) => i.team.id === homeId);
  const awayInjuries = injuries.filter((i) => i.team.id === awayId);

  return {
    fixture,
    homeStats,
    awayStats,
    homeRecent,
    awayRecent,
    h2h,
    odds,
    standings,
    homeInjuries,
    awayInjuries,
  };
}

export type FixtureContext = NonNullable<
  Awaited<ReturnType<typeof fetchFixtureContext>>
>;


/**
 * Players unavailable for a given fixture, optionally filtered to one team.
 * api-football populates this from official club / league sources.
 */
export async function getInjuries(args: {
  fixtureId: number;
  teamId?: number;
}): Promise<import("./types").ApiInjury[]> {
  const params: Record<string, string | number> = { fixture: args.fixtureId };
  if (args.teamId) params.team = args.teamId;
  return apiFootballGet<import("./types").ApiInjury>(
    "/injuries",
    params,
    { revalidate: 1800 },
  );
}
