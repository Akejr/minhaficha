import { apiFootballGet } from "./client";
import { leaguePriority } from "./league-priority";
import type { ApiFixture } from "./types";

/**
 * The free tier: three fixtures, always ones there is still something to watch.
 *
 * Two different sets live in this file, and keeping them apart is the whole
 * point:
 *
 *   fetchPopularFixtures()   → what we SHOW. Finished matches are dropped, and
 *                              once today is exhausted it rolls over to
 *                              tomorrow, so the strip is never a list of games
 *                              that already ended.
 *
 *   fetchFreeAccessIds()     → what stays UNLOCKED. This is the shown set plus
 *                              the three that were on display earlier today,
 *                              before they ended.
 *
 * Why the second one exists: a visitor reading an analysis when the final
 * whistle blows must not have it locked under them. Dropping a match from the
 * display is a merchandising decision; revoking access mid-read is a bug, and
 * we had exactly that bug before when the free set rotated on kickoff.
 *
 * Recovering "the three from earlier today" is possible because selection is
 * deterministic: same pool, same order, same result. Running the picker over
 * today's full pool (finished included) reproduces the choice the visitor saw,
 * so the grace is exactly three fixtures — not a free pass to every match that
 * ended today.
 *
 * The selection itself is:
 *   - scoped to TODAY in São Paulo time;
 *   - deterministic — no randomness, ordering fully defined;
 *   - spread across the day, two in the afternoon and one at night, so someone
 *     opening the app at 15h and again at 22h finds something useful.
 *
 * Cost: one API call per refresh window instead of one per league (7 → 1).
 * Both exported functions share that cached call.
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
  /**
   * Same idea but day-aware: "Hoje, 21:30", "Amanhã, 16:00", "Ao vivo",
   * "Encerrado". Needed since the free set rolls over to tomorrow once today's
   * matches are done — "Hoje" would then be a lie.
   */
  whenLabel: string;
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

/** "Hoje", "Amanhã", or a short date for anything further out. */
function dayLabel(f: ApiFixture): string {
  const day = partsInTz(new Date(f.fixture.timestamp * 1000)).date;
  if (day === localDate(0)) return "Hoje";
  if (day === localDate(1)) return "Amanhã";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(f.fixture.timestamp * 1000));
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
    whenLabel:
      state === "finished"
        ? "Encerrado"
        : state === "live"
          ? "Ao vivo"
          : `${dayLabel(f)}, ${timeLabel(f)}`,
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

const hourOf = (f: ApiFixture) =>
  partsInTz(new Date(f.fixture.timestamp * 1000)).hour;

/** Add up to `n` fixtures from `pool` that aren't already chosen. */
function topUp(
  chosen: ApiFixture[],
  pool: ApiFixture[],
  n: number,
): ApiFixture[] {
  if (n <= 0) return [];
  const ids = new Set(chosen.map((f) => f.fixture.id));
  return pickSpread(
    pool.filter((f) => !ids.has(f.fixture.id)).sort(byRelevance),
    n,
  );
}

/**
 * The deterministic pick: two in the afternoon, one at night, topped up from
 * whatever else is in the pool.
 *
 * Pure and stable — the same pool always yields the same three. That property
 * is what lets `fetchFreeAccessIds` reconstruct what was on display earlier.
 */
function selectThree(pool: ApiFixture[]): ApiFixture[] {
  const afternoon = pool
    .filter((f) => hourOf(f) < NIGHT_STARTS_AT_HOUR)
    .sort(byRelevance);

  // For the night slot we want it genuinely late, so order by kickoff
  // descending first and only then by league relevance.
  const night = pool
    .filter((f) => hourOf(f) >= NIGHT_STARTS_AT_HOUR)
    .sort((a, b) => {
      if (a.fixture.timestamp !== b.fixture.timestamp) {
        return b.fixture.timestamp - a.fixture.timestamp;
      }
      return byRelevance(a, b);
    });

  const chosen = [...pickSpread(afternoon, 2), ...pickSpread(night, 1)];
  chosen.push(...topUp(chosen, pool, FREE_FIXTURES_LIMIT - chosen.length));
  return chosen.slice(0, FREE_FIXTURES_LIMIT);
}

/**
 * The fixtures to SHOW: three that haven't ended yet.
 *
 * A finished match is dropped, and when today runs out — every match played, or
 * a thin midweek card — the remaining slots come from tomorrow. So late at
 * night the strip naturally becomes tomorrow's games instead of a row of final
 * scores.
 */
export async function fetchPopularFixtures(): Promise<PopularFixture[]> {
  const today = await fixturesOn(localDate(0));

  // Scheduled and in-play only. A match being played is the most compelling
  // thing we can show, so "live" stays.
  const pending = today.filter((f) => toState(f) !== "finished");

  const chosen = selectThree(pending);

  if (chosen.length < FREE_FIXTURES_LIMIT) {
    const tomorrow = await fixturesOn(localDate(1));
    chosen.push(
      ...topUp(chosen, tomorrow, FREE_FIXTURES_LIMIT - chosen.length),
    );
  }

  return chosen
    .slice(0, FREE_FIXTURES_LIMIT)
    .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
    .map(toPopular);
}

/**
 * The fixtures that stay UNLOCKED: everything on display, plus the three that
 * were on display earlier today.
 *
 * The second half is the grace period. Without it, a match ending would revoke
 * access from whoever was reading it, and anyone who opened it earlier would
 * find it locked when they came back — which is worse than never having shown
 * it, because they already saw it was free.
 */
export async function fetchFreeAccessIds(): Promise<Set<number>> {
  const [shown, today] = await Promise.all([
    fetchPopularFixtures(),
    fixturesOn(localDate(0)),
  ]);

  const ids = new Set(shown.map((f) => f.fixtureId));
  // Re-run the picker over today's FULL pool to reproduce what was displayed
  // before those matches ended.
  for (const f of selectThree(today)) ids.add(f.fixture.id);
  return ids;
}
