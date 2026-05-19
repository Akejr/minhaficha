import { apiFootballGet } from "./client";
import type { ApiFixture, ApiTeam } from "./types";
import { translateForSearch } from "@/lib/i18n/team-translations";

/**
 * Search teams by name. The API mostly indexes English names, so we translate
 * common Portuguese terms first and merge the result with a search using the
 * original query. Examples: "brasil" → "brazil", "marrocos" → "morocco".
 */
export async function searchTeams(query: string): Promise<ApiTeam[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const variants = [q];
  const translated = translateForSearch(q);
  if (translated && translated !== q.toLowerCase()) {
    variants.push(translated);
  }

  const results = await Promise.all(
    variants.map((v) =>
      apiFootballGet<{ team: ApiTeam }>(
        "/teams",
        { search: v },
        { revalidate: 3600 },
      ).catch(() => [] as { team: ApiTeam }[]),
    ),
  );

  // Dedupe by team id while preserving order: matches in the original-language
  // search come first, translated matches fill in the gaps.
  const seen = new Set<number>();
  const out: ApiTeam[] = [];
  for (const list of results) {
    for (const row of list) {
      if (!seen.has(row.team.id)) {
        seen.add(row.team.id);
        out.push(row.team);
      }
    }
  }
  return out;
}

/** Next N upcoming fixtures for a single team. */
export async function nextFixturesForTeam(
  teamId: number,
  next = 5,
): Promise<ApiFixture[]> {
  return apiFootballGet<ApiFixture>(
    "/fixtures",
    { team: teamId, next },
    { revalidate: 600 },
  );
}

export type SearchHit = {
  fixtureId: number;
  league: string;
  country: string;
  kickoff: string;
  status: string;
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
  /** Which side of the fixture matched the user's query (for highlighting). */
  matchedSide: "home" | "away" | "both";
};

/**
 * Top-level search.
 *
 *   1. Find teams matching the query (capped at `teamLimit`).
 *   2. For each team, fetch the next `perTeam` upcoming fixtures.
 *   3. From each team's fixtures, keep the FIRST fixture of each distinct
 *      league. This way a team that has e.g. La Liga + Champions League +
 *      Copa del Rey upcoming will surface 3 hits — one per competition.
 *   4. Merge across teams, dedupe by fixtureId, sort by kickoff.
 */
export async function searchUpcomingFixtures(
  query: string,
  opts: { teamLimit?: number; perTeam?: number } = {},
): Promise<SearchHit[]> {
  const teamLimit = opts.teamLimit ?? 6;
  const perTeam = opts.perTeam ?? 5;

  const teams = await searchTeams(query);
  if (teams.length === 0) return [];

  const top = teams.slice(0, teamLimit);
  const matchingIds = new Set(top.map((t) => t.id));

  const fixturesPerTeam = await Promise.all(
    top.map((t) =>
      nextFixturesForTeam(t.id, perTeam).catch(() => [] as ApiFixture[]),
    ),
  );

  const byFixtureId = new Map<number, SearchHit>();

  for (const list of fixturesPerTeam) {
    // Within a single team's upcoming list, keep at most one fixture per league.
    const seenLeagueForTeam = new Set<number>();
    for (const f of list) {
      if (seenLeagueForTeam.has(f.league.id)) continue;
      seenLeagueForTeam.add(f.league.id);

      const id = f.fixture.id;
      if (byFixtureId.has(id)) {
        // Both teams matched the search → annotate.
        byFixtureId.get(id)!.matchedSide = "both";
        continue;
      }
      const homeMatched = matchingIds.has(f.teams.home.id);
      const awayMatched = matchingIds.has(f.teams.away.id);

      byFixtureId.set(id, {
        fixtureId: id,
        league: f.league.name,
        country: f.league.country,
        kickoff: f.fixture.date,
        status: f.fixture.status.long,
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
        matchedSide:
          homeMatched && awayMatched ? "both" : homeMatched ? "home" : "away",
      });
    }
  }

  return [...byFixtureId.values()]
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    .slice(0, 12);
}
