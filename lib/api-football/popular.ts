import { apiFootballGet } from "./client";
import { leaguePriority } from "./league-priority";
import type { ApiFixture } from "./types";

/**
 * The free tier: three fixtures picked once per day and held for the whole day.
 *
 * Why it works this way
 * --------------------
 * The previous version asked for the "next 2" fixtures per league and dropped
 * anything already kicked off. That made the free set rotate all day long, and
 * worse, a match lost its free access the moment it started — a visitor
 * reading an analysis could have it locked mid-game.
 *
 * Now the selection is:
 *   - scoped to TODAY in São Paulo time;
 *   - deterministic, so the same day always yields the same three fixtures
 *     (no randomness, ordering fully defined);
 *   - spread across the day — two in the afternoon and one at night, so
 *     someone opening the app at 15h and again at 22h finds something useful;
 *   - kept in place after the final whistle, flagged as finished, instead of
 *     disappearing.
 *
 * It also costs less: one API call per refresh window instead of one per
 * league (7 → 1).
 */

const FEATURED_LEAGUE_IDS = new Set([
  71, // Brasileirão Série A
  73, // Copa do Brasil
  13, // Libertadores
  11, // Sul-Americana
  72, // Brasileirão Série B
  2, // Champions League
  3, // Europa League
  39, // Premier League
  140, // La Liga
  135, // Serie A
  78, // Bundesliga
  61, // Ligue 1
]);

const FREE_FIXTURES_LIMIT = 3;

/** Brazilian audience, so "today" and "afternoon" mean São Paulo time. */
const TZ = "America/Sao_Paulo";

/**
 * 5 minutes. Long enough to keep API usage low (~288 calls/day, down from
 * ~2000), short enough that scores and the "encerrado" flag stay current.
 */
const REVALIDATE_SECONDS = 5 * 60;

/** Kickoff hour (local) that separates the afternoon slot from the night one. */
const NIGHT_STARTS_AT_HOUR = 19;

export type FixtureState = "scheduled" | "live" | "finished";

export type PopularFixture = {
  fixtureId: number;
  league: string;
  country: string;
  kickoff: string;
  state: FixtureState;
  /** Ready to render: "21:30", "Ao vivo" or "Encerrado". */
  stateLabel: string;
  /** Final or running score. null before kickoff. */
  score: { home: number; away: number } | null;
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
};

/** API-Football status codes, grouped. */
const FINISHED = new Set(["FT", "AET", "PEN"]);
const LIVE = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"]);
/** Nothing useful to analyse — excluded from selection entirely. */
const DEAD = new Set(["PST", "CANC", "ABD", "AWD", "WO", "TBD", "SUSP"]);

function partsInTz(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return {
    date: `${out.year}-${out.month}-${out.day}`,
    // Intl can return "24" for midnight in some environments.
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
  };
}

/** YYYY-MM-DD for "today" (and tomorrow) in São Paulo. */
function localDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return partsInTz(d).date;
}

function timeLabel(f: ApiFixture): string {
  const { hour, minute } = partsInTz(new Date(f.fixture.timestamp * 1000));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toState(f: ApiFixture): FixtureState {
  const s = f.fixture.status.short;
  if (FINISHED.has(s)) return "finished";
  if (LIVE.has(s)) return "live";
  return "scheduled";
}

function toPopular(f: ApiFixture): PopularFixture {
  const state = toState(f);
  const hasScore = f.goals.home != null && f.goals.away != null;

  return {
    fixtureId: f.fixture.id,
    league: f.league.name,
    country: f.league.country,
    kickoff: f.fixture.date,
    state,
    stateLabel:
      state === "finished"
        ? "Encerrado"
        : state === "live"
          ? "Ao vivo"
          : timeLabel(f),
    score:
      hasScore && state !== "scheduled"
        ? { home: f.goals.home as number, away: f.goals.away as number }
        : null,
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
  };
}

/** All fixtures on a given local date, restricted to the featured leagues. */
async function fixturesOn(date: string): Promise<ApiFixture[]> {
  const all = await apiFootballGet<ApiFixture>(
    "/fixtures",
    { date, timezone: TZ },
    { revalidate: REVALIDATE_SECONDS },
  ).catch(() => [] as ApiFixture[]);

  return all.filter(
    (f) =>
      FEATURED_LEAGUE_IDS.has(f.league.id) &&
      !DEAD.has(f.fixture.status.short),
  );
}

/**
 * Deterministic ordering: most relevant league first, then earliest kickoff,
 * then fixture id to break exact ties. No randomness anywhere, which is what
 * keeps the selection stable across requests within the same day.
 */
function byRelevance(a: ApiFixture, b: ApiFixture): number {
  const pa = leaguePriority(a.league.id);
  const pb = leaguePriority(b.league.id);
  if (pa !== pb) return pa - pb;
  if (a.fixture.timestamp !== b.fixture.timestamp) {
    return a.fixture.timestamp - b.fixture.timestamp;
  }
  return a.fixture.id - b.fixture.id;
}

/**
 * Pick up to `n` fixtures from `pool`, preferring distinct kickoff hours so
 * the free set doesn't end up as three matches at the same time.
 */
function pickSpread(pool: ApiFixture[], n: number): ApiFixture[] {
  const chosen: ApiFixture[] = [];
  const usedHours = new Set<number>();

  for (const f of pool) {
    if (chosen.length >= n) break;
    const h = partsInTz(new Date(f.fixture.timestamp * 1000)).hour;
    if (usedHours.has(h)) continue;
    usedHours.add(h);
    chosen.push(f);
  }

  // Not enough distinct hours — top up allowing repeats.
  if (chosen.length < n) {
    const ids = new Set(chosen.map((f) => f.fixture.id));
    for (const f of pool) {
      if (chosen.length >= n) break;
      if (!ids.has(f.fixture.id)) chosen.push(f);
    }
  }
  return chosen;
}

/**
 * Today's free fixtures: two in the afternoon, one at night.
 *
 * Falls back gracefully — if today is thin (international break, midweek gap)
 * it fills the remaining slots from the rest of today, then from tomorrow, so
 * the free tier is never empty.
 */
export async function fetchPopularFixtures(): Promise<PopularFixture[]> {
  const today = await fixturesOn(localDate(0));

  const hourOf = (f: ApiFixture) =>
    partsInTz(new Date(f.fixture.timestamp * 1000)).hour;

  const afternoon = today
    .filter((f) => hourOf(f) < NIGHT_STARTS_AT_HOUR)
    .sort(byRelevance);

  // For the night slot we want it genuinely late, so order by kickoff
  // descending first and only then by league relevance.
  const night = today
    .filter((f) => hourOf(f) >= NIGHT_STARTS_AT_HOUR)
    .sort((a, b) => {
      if (a.fixture.timestamp !== b.fixture.timestamp) {
        return b.fixture.timestamp - a.fixture.timestamp;
      }
      return byRelevance(a, b);
    });

  const chosen: ApiFixture[] = [
    ...pickSpread(afternoon, 2),
    ...pickSpread(night, 1),
  ];

  // Top up from anything else today, then from tomorrow.
  if (chosen.length < FREE_FIXTURES_LIMIT) {
    const ids = new Set(chosen.map((f) => f.fixture.id));
    const rest = today.filter((f) => !ids.has(f.fixture.id)).sort(byRelevance);
    chosen.push(...pickSpread(rest, FREE_FIXTURES_LIMIT - chosen.length));
  }

  if (chosen.length < FREE_FIXTURES_LIMIT) {
    const tomorrow = (await fixturesOn(localDate(1))).sort(byRelevance);
    const ids = new Set(chosen.map((f) => f.fixture.id));
    chosen.push(
      ...pickSpread(
        tomorrow.filter((f) => !ids.has(f.fixture.id)),
        FREE_FIXTURES_LIMIT - chosen.length,
      ),
    );
  }

  // Display order: chronological, so a finished match sits above the one
  // still to come.
  return chosen
    .slice(0, FREE_FIXTURES_LIMIT)
    .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
    .map(toPopular);
}
