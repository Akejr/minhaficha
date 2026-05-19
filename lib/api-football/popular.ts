import { apiFootballGet } from "./client";
import type { ApiFixture } from "./types";

/**
 * Top European leagues we feature on the home page.
 * Order doesn't matter for display — we sort by kickoff and pick the soonest.
 */
const TOP_EUROPEAN_LEAGUES = [
  { id: 2, name: "Champions League" },
  { id: 3, name: "Europa League" },
  { id: 39, name: "Premier League" },
  { id: 140, name: "La Liga" },
  { id: 135, name: "Serie A" },
  { id: 78, name: "Bundesliga" },
  { id: 61, name: "Ligue 1" },
];

const HOME_FIXTURES_LIMIT = 3;

/**
 * Cache TTL is short on purpose: we want the home page to refresh once a
 * kickoff has passed, swapping the now-stale match for the next one.
 */
const REVALIDATE_SECONDS = 5 * 60;

export type PopularFixture = {
  fixtureId: number;
  league: string;
  country: string;
  kickoff: string;
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
};

/**
 * Pull the next 2 fixtures from each top league, drop anything whose kickoff
 * has already passed, sort the survivors by date, and return the 3 soonest
 * — guaranteed each from a distinct league.
 */
export async function fetchPopularFixtures(): Promise<PopularFixture[]> {
  const lists = await Promise.all(
    TOP_EUROPEAN_LEAGUES.map((l) =>
      apiFootballGet<ApiFixture>(
        "/fixtures",
        { league: l.id, next: 2 },
        { revalidate: REVALIDATE_SECONDS },
      ).catch(() => [] as ApiFixture[]),
    ),
  );

  const now = Date.now();

  // From each league, take the first fixture that is genuinely still upcoming.
  const candidates: ApiFixture[] = [];
  for (const list of lists) {
    const next = list.find((f) => f.fixture.timestamp * 1000 > now);
    if (next) candidates.push(next);
  }

  candidates.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);

  return candidates.slice(0, HOME_FIXTURES_LIMIT).map((f) => ({
    fixtureId: f.fixture.id,
    league: f.league.name,
    country: f.league.country,
    kickoff: f.fixture.date,
    home: {
      id: f.teams.home.id,
      name: f.teams.home.name,
      logo: f.teams.home.logo,
    },
    away: {
      id: f.teams.away.id,
      name: f.teams.away.name,
      logo: f.teams.away.logo,
    },
  }));
}
