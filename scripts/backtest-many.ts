/**
 * Mass backtest: replay our model against the last N finished fixtures from
 * the top European leagues, simulating an "as-of the day before" analysis.
 *
 *   npx tsx scripts/backtest-many.ts [--limit=30] [--days=60]
 *
 * Output:
 *   - per-fixture summary line
 *   - aggregate metrics (Brier, log-loss, accuracy at p≥0.5)
 *   - calibration buckets (when we say 60-70%, are we right ~65% of the time?)
 *   - performance of the 3-pick strategy by risk level
 *   - markdown report saved to backtest-results/<timestamp>.md
 *
 * Disk cache:
 *   API responses are cached under .backtest-cache/ so re-runs are free.
 *
 * Caveats:
 *   /teams/statistics still reflects the FULL season; we accept this for
 *   a directional check. Recent fixtures and H2H are filtered correctly.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { apiFootballGet } from "../lib/api-football/client";
import {
  getTeamStatistics,
  getStandings,
  getInjuries,
} from "../lib/api-football/queries";
import type { ApiFixture, ApiInjury, ApiOdds } from "../lib/api-football/types";
import { extractFeatures } from "../lib/betting/features";
import { computeMarkets } from "../lib/betting/markets";
import {
  buildAnalysisPayload,
  type AnalysisPayload,
} from "../lib/betting/payload";
import { rebuildSeasonStats } from "../lib/betting/season-rates";
import {
  applyMarketPrior,
  extractMarketProbs,
} from "../lib/betting/market-prior";

const TOP_LEAGUE_IDS = [39, 140, 135, 78, 61, 2, 94, 71]; // PL, La Liga, Serie A, BL, Ligue 1, UCL, Liga Portugal, Brasileirão
const CACHE_DIR = path.resolve(".backtest-cache");
const RESULTS_DIR = path.resolve("backtest-results");

type Args = { limit: number; days: number };

function parseArgs(): Args {
  const out: Args = { limit: 30, days: 60 };
  for (const arg of process.argv.slice(2)) {
    const m = /^--(\w+)=(.+)$/.exec(arg);
    if (!m) continue;
    if (m[1] === "limit") out.limit = parseInt(m[2], 10);
    if (m[1] === "days") out.days = parseInt(m[2], 10);
  }
  return out;
}

// ---------- disk cache ----------

async function ensureDirs() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const file = path.join(CACHE_DIR, key.replace(/[^a-z0-9_-]/gi, "_") + ".json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    /* miss */
  }
  const v = await fn();
  await fs.writeFile(file, JSON.stringify(v));
  return v;
}

// ---------- fetching ----------

async function listFinishedFixtures(args: Args): Promise<ApiFixture[]> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - args.days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Cover the season(s) that overlap our window. European seasons start in
  // August, so a query that crosses August needs both years.
  const seasons = new Set<number>();
  for (let d = new Date(from); d <= to; d.setMonth(d.getMonth() + 1)) {
    seasons.add(seasonForDate(d));
  }
  seasons.add(seasonForDate(to));

  const out: ApiFixture[] = [];
  for (const leagueId of TOP_LEAGUE_IDS) {
    for (const season of seasons) {
      const list = await cached(
        `fixtures_${leagueId}_${season}_${fmt(from)}_${fmt(to)}`,
        () =>
          apiFootballGet<ApiFixture>("/fixtures", {
            league: leagueId,
            season,
            from: fmt(from),
            to: fmt(to),
          }),
      );
      for (const f of list) {
        if (
          f.fixture.status.short === "FT" &&
          f.goals.home != null &&
          f.goals.away != null
        ) {
          out.push(f);
        }
      }
    }
  }
  // Sort newest first, then trim.
  out.sort((a, b) => b.fixture.timestamp - a.fixture.timestamp);
  return out.slice(0, args.limit);
}

/** API-Football "season" convention: 2024-25 is season 2024. */
function seasonForDate(d: Date): number {
  // Aug or later → starts that calendar year. Otherwise → previous year.
  return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

async function fetchAsOfContext(fixture: ApiFixture, asOf: Date) {
  const homeId = fixture.teams.home.id;
  const awayId = fixture.teams.away.id;
  const leagueId = fixture.league.id;
  const season = fixture.league.season;
  const cacheKey = (k: string) => `${homeId}_${awayId}_${leagueId}_${season}_${k}`;

  // We need ALL season fixtures of each team to rebuild stats as-of `asOf`
  // (avoiding data leakage). last=50 is enough to cover a full European season.
  const recent = (teamId: number) =>
    cached(`team_${teamId}_recent50`, () =>
      apiFootballGet<ApiFixture>("/fixtures", { team: teamId, last: 50 }),
    );
  const seasonFixtures = (teamId: number) =>
    cached(`team_${teamId}_season_${leagueId}_${season}`, () =>
      apiFootballGet<ApiFixture>("/fixtures", { team: teamId, league: leagueId, season }),
    );

  const [
    homeStatsRaw,
    awayStatsRaw,
    homeRecentRaw,
    awayRecentRaw,
    homeSeasonFx,
    awaySeasonFx,
    h2hRaw,
    standings,
    odds,
    injuries,
  ] = await Promise.all([
    cached(cacheKey("home_season"), () =>
      getTeamStatistics({ teamId: homeId, leagueId, season }),
    ).catch(() => null),
    cached(cacheKey("away_season"), () =>
      getTeamStatistics({ teamId: awayId, leagueId, season }),
    ).catch(() => null),
    recent(homeId).catch(() => [] as ApiFixture[]),
    recent(awayId).catch(() => [] as ApiFixture[]),
    seasonFixtures(homeId).catch(() => [] as ApiFixture[]),
    seasonFixtures(awayId).catch(() => [] as ApiFixture[]),
    cached(cacheKey("h2h"), () =>
      apiFootballGet<ApiFixture>("/fixtures/headtohead", {
        h2h: `${homeId}-${awayId}`,
        last: 50,
      }),
    ).catch(() => [] as ApiFixture[]),
    cached(cacheKey("standings"), () => getStandings(leagueId, season)).catch(
      () => null,
    ),
    cached(`odds_${fixture.fixture.id}`, () =>
      apiFootballGet<ApiOdds>("/odds", { fixture: fixture.fixture.id }),
    ).catch(() => [] as ApiOdds[]),
    cached(`injuries_${fixture.fixture.id}`, () =>
      getInjuries({ fixtureId: fixture.fixture.id }),
    ).catch(() => [] as ApiInjury[]),
  ]);

  // Rebuild season stats from the raw fixture list, excluding anything
  // on/after asOf. This is the key fix for data leakage.
  const homeStats = rebuildSeasonStats({
    allTeamFixtures: homeSeasonFx,
    leagueId,
    season,
    teamId: homeId,
    asOf,
    fallback: homeStatsRaw,
  });
  const awayStats = rebuildSeasonStats({
    allTeamFixtures: awaySeasonFx,
    leagueId,
    season,
    teamId: awayId,
    asOf,
    fallback: awayStatsRaw,
  });

  const before = (f: ApiFixture) => new Date(f.fixture.date).getTime() < asOf.getTime();
  return {
    fixture,
    homeStats,
    awayStats,
    homeRecent: homeRecentRaw.filter(before).slice(0, 10),
    awayRecent: awayRecentRaw.filter(before).slice(0, 10),
    h2h: h2hRaw.filter(before).slice(0, 10),
    odds,
    standings,
    homeInjuries: injuries.filter((i) => i.team.id === homeId),
    awayInjuries: injuries.filter((i) => i.team.id === awayId),
  };
}

// ---------- pick strategy + settlement ----------

const SUGG_MIN = 0.08;
const SUGG_MAX = 0.80;
const RISK = {
  low: { min: 0.6, max: 0.78 },
  medium: { min: 0.38, max: 0.58 },
  high: { min: 0.18, max: 0.32 },
} as const;

type Pick = {
  level: "low" | "medium" | "high";
  market: AnalysisPayload["markets"][number];
};

function pickThree(payload: AnalysisPayload): Pick[] {
  const eligible = payload.markets.filter(
    (m) => m.probability >= SUGG_MIN && m.probability <= SUGG_MAX,
  );
  const used = new Set<string>();
  const picks: Pick[] = [];
  for (const level of ["low", "medium", "high"] as const) {
    const band = RISK[level];
    const mid = (band.min + band.max) / 2;
    const inBand = eligible
      .filter((m) => !used.has(m.category))
      .filter((m) => m.probability >= band.min && m.probability <= band.max)
      .sort((a, b) => Math.abs(a.probability - mid) - Math.abs(b.probability - mid));
    const fallback = eligible
      .filter((m) => !used.has(m.category))
      .sort((a, b) => Math.abs(a.probability - mid) - Math.abs(b.probability - mid));
    const choice = inBand[0] ?? fallback[0];
    if (choice) {
      picks.push({ level, market: choice });
      used.add(choice.category);
    }
  }
  return picks;
}

function settleFinal(key: string, hg: number, ag: number): boolean | null {
  const tot = hg + ag;
  switch (key) {
    case "HOME_WIN": return hg > ag;
    case "AWAY_WIN": return ag > hg;
    case "DRAW": return hg === ag;
    case "HOME_OR_DRAW": return hg >= ag;
    case "AWAY_OR_DRAW": return ag >= hg;
    case "OVER_1_5": return tot >= 2;
    case "OVER_2_5": return tot >= 3;
    case "OVER_3_5": return tot >= 4;
    case "OVER_4_5": return tot >= 5;
    case "UNDER_1_5": return tot <= 1;
    case "UNDER_2_5": return tot <= 2;
    case "HOME_OVER_1_5": return hg >= 2;
    case "HOME_OVER_2_5": return hg >= 3;
    case "AWAY_OVER_1_5": return ag >= 2;
    case "AWAY_OVER_2_5": return ag >= 3;
    case "BTTS": return hg >= 1 && ag >= 1;
    case "HOME_WIN_AND_HOME_OVER_1_5": return hg > ag && hg >= 2;
    case "HOME_WIN_AND_HOME_OVER_2_5": return hg > ag && hg >= 3;
    case "AWAY_WIN_AND_AWAY_OVER_1_5": return ag > hg && ag >= 2;
    case "AWAY_WIN_AND_AWAY_OVER_2_5": return ag > hg && ag >= 3;
  }
  return null;
}

function settleHT(key: string, htHome: number | null, htAway: number | null): boolean | null {
  if (htHome == null || htAway == null) return null;
  const tot = htHome + htAway;
  if (key === "OVER_1_5_HT") return tot >= 2;
  if (key === "OVER_2_5_HT") return tot >= 3;
  return null;
}

function settle(key: string, fx: ApiFixture): boolean | null {
  const ft = settleFinal(key, fx.goals.home!, fx.goals.away!);
  if (ft != null) return ft;
  return settleHT(key, fx.score.halftime.home, fx.score.halftime.away);
}

// ---------- metrics ----------

type MarketEval = { key: string; p: number; outcome: boolean };

function brier(samples: MarketEval[]): number {
  if (samples.length === 0) return NaN;
  const s = samples.reduce(
    (acc, x) => acc + (x.p - (x.outcome ? 1 : 0)) ** 2,
    0,
  );
  return s / samples.length;
}

function logLoss(samples: MarketEval[]): number {
  if (samples.length === 0) return NaN;
  const eps = 1e-12;
  const s = samples.reduce((acc, x) => {
    const p = Math.min(1 - eps, Math.max(eps, x.p));
    return acc + (x.outcome ? -Math.log(p) : -Math.log(1 - p));
  }, 0);
  return s / samples.length;
}

function accuracy(samples: MarketEval[]): { hits: number; n: number; pct: number } {
  if (samples.length === 0) return { hits: 0, n: 0, pct: NaN };
  let hits = 0;
  for (const x of samples) {
    const predict = x.p >= 0.5;
    if (predict === x.outcome) hits++;
  }
  return { hits, n: samples.length, pct: hits / samples.length };
}

function calibrationBuckets(samples: MarketEval[]) {
  const buckets = [
    { lo: 0.0, hi: 0.1 },
    { lo: 0.1, hi: 0.2 },
    { lo: 0.2, hi: 0.3 },
    { lo: 0.3, hi: 0.4 },
    { lo: 0.4, hi: 0.5 },
    { lo: 0.5, hi: 0.6 },
    { lo: 0.6, hi: 0.7 },
    { lo: 0.7, hi: 0.8 },
    { lo: 0.8, hi: 0.9 },
    { lo: 0.9, hi: 1.001 },
  ];
  return buckets.map((b) => {
    const inB = samples.filter((s) => s.p >= b.lo && s.p < b.hi);
    const expected =
      inB.length === 0 ? NaN : inB.reduce((a, x) => a + x.p, 0) / inB.length;
    const actual =
      inB.length === 0 ? NaN : inB.filter((x) => x.outcome).length / inB.length;
    return { lo: b.lo, hi: b.hi, n: inB.length, expected, actual };
  });
}

// ---------- main ----------

async function main() {
  const args = parseArgs();
  await ensureDirs();
  console.log(`[backtest] last ${args.days} days, target up to ${args.limit} fixtures.`);

  const fixtures = await listFinishedFixtures(args);
  console.log(`[backtest] ${fixtures.length} finished fixtures available across top leagues.`);

  const allSamples: MarketEval[] = [];
  const samplesByMarket = new Map<string, MarketEval[]>();
  type PickRow = {
    fixtureId: number;
    homeName: string;
    awayName: string;
    league: string;
    score: string;
    level: "low" | "medium" | "high";
    label: string;
    p: number;
    outcome: boolean | null;
  };
  const picksLog: PickRow[] = [];

  for (let i = 0; i < fixtures.length; i++) {
    const fx = fixtures[i];
    const asOf = new Date(fx.fixture.timestamp * 1000);
    asOf.setUTCDate(asOf.getUTCDate() - 1); // analyse "the day before"

    process.stdout.write(
      `[${String(i + 1).padStart(3)}/${fixtures.length}] ${fx.teams.home.name} vs ${fx.teams.away.name}…`,
    );

    try {
      const ctx = await fetchAsOfContext(fx, asOf);
      const features = extractFeatures(ctx);
      const markets = computeMarkets(features);
      const payload = buildAnalysisPayload(ctx, features, markets);

      // Score every settle-able market for global metrics.
      for (const m of payload.markets) {
        const out = settle(m.key, fx);
        if (out == null) continue;
        const sample: MarketEval = { key: m.key, p: m.probability, outcome: out };
        allSamples.push(sample);
        const arr = samplesByMarket.get(m.key) ?? [];
        arr.push(sample);
        samplesByMarket.set(m.key, arr);
      }

      // Score the 3-pick strategy.
      const picks = pickThree(payload);
      for (const p of picks) {
        const out = settle(p.market.key, fx);
        picksLog.push({
          fixtureId: fx.fixture.id,
          homeName: fx.teams.home.name,
          awayName: fx.teams.away.name,
          league: fx.league.name,
          score: `${fx.goals.home}-${fx.goals.away}`,
          level: p.level,
          label: p.market.label,
          p: p.market.probability,
          outcome: out,
        });
      }
      console.log(" ok");
    } catch (err) {
      console.log(` FAILED (${(err as Error).message})`);
    }
  }

  // Aggregate.
  const overall = {
    n: allSamples.length,
    brier: brier(allSamples),
    logLoss: logLoss(allSamples),
    accuracy: accuracy(allSamples),
  };
  const calib = calibrationBuckets(allSamples);

  const perMarket: { key: string; n: number; brier: number; acc: number }[] = [];
  for (const [key, list] of samplesByMarket) {
    perMarket.push({
      key,
      n: list.length,
      brier: brier(list),
      acc: accuracy(list).pct,
    });
  }
  perMarket.sort((a, b) => b.n - a.n);

  // Pick-strategy metrics by risk level.
  const settledPicks = picksLog.filter((p) => p.outcome != null);
  const byLevel: Record<"low" | "medium" | "high", PickRow[]> = {
    low: settledPicks.filter((p) => p.level === "low"),
    medium: settledPicks.filter((p) => p.level === "medium"),
    high: settledPicks.filter((p) => p.level === "high"),
  };
  const levelMetrics = (rows: PickRow[]) => ({
    n: rows.length,
    hitRate: rows.length === 0 ? NaN : rows.filter((r) => r.outcome).length / rows.length,
    avgClaimedProb: rows.length === 0 ? NaN : rows.reduce((s, r) => s + r.p, 0) / rows.length,
  });
  const lowM = levelMetrics(byLevel.low);
  const medM = levelMetrics(byLevel.medium);
  const highM = levelMetrics(byLevel.high);

  // Console summary.
  console.log("\n=== AGGREGATE ===");
  console.log(`samples:   ${overall.n}`);
  console.log(`Brier:     ${overall.brier.toFixed(4)}  (lower = better; 0.25 is "random for 50/50")`);
  console.log(`Log-loss:  ${overall.logLoss.toFixed(4)}  (lower = better)`);
  console.log(`Accuracy:  ${(overall.accuracy.pct * 100).toFixed(1)}% (${overall.accuracy.hits}/${overall.accuracy.n})  using p>=0.5`);

  console.log("\n=== CALIBRATION ===");
  console.log("bucket            n     expected   actual    delta");
  for (const b of calib) {
    if (b.n === 0) continue;
    const exp = (b.expected * 100).toFixed(1);
    const act = (b.actual * 100).toFixed(1);
    const delta = ((b.actual - b.expected) * 100).toFixed(1);
    console.log(
      `${(b.lo * 100).toFixed(0).padStart(2)}%-${(b.hi * 100).toFixed(0).padStart(3)}%  ${String(b.n).padStart(4)}    ${exp.padStart(6)}%  ${act.padStart(6)}%  ${delta.padStart(6)}%`,
    );
  }

  console.log("\n=== 3-PICK STRATEGY HIT RATE ===");
  for (const [name, m] of [
    ["LOW   ", lowM],
    ["MEDIUM", medM],
    ["HIGH  ", highM],
  ] as const) {
    if (m.n === 0) continue;
    console.log(
      `${name}  n=${String(m.n).padStart(3)}  hit=${(m.hitRate * 100).toFixed(1)}%  avg claimed=${(m.avgClaimedProb * 100).toFixed(1)}%`,
    );
  }

  // Markdown report.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const md = generateMarkdown({
    fixturesCount: fixtures.length,
    overall,
    calib,
    perMarket,
    picksLog,
    byLevel: { low: lowM, medium: medM, high: highM },
  });
  const file = path.join(RESULTS_DIR, `${ts}.md`);
  await fs.writeFile(file, md);
  console.log(`\nReport saved to ${file}`);
}

function generateMarkdown(d: {
  fixturesCount: number;
  overall: { n: number; brier: number; logLoss: number; accuracy: { hits: number; n: number; pct: number } };
  calib: { lo: number; hi: number; n: number; expected: number; actual: number }[];
  perMarket: { key: string; n: number; brier: number; acc: number }[];
  picksLog: {
    fixtureId: number;
    homeName: string;
    awayName: string;
    league: string;
    score: string;
    level: "low" | "medium" | "high";
    label: string;
    p: number;
    outcome: boolean | null;
  }[];
  byLevel: {
    low: { n: number; hitRate: number; avgClaimedProb: number };
    medium: { n: number; hitRate: number; avgClaimedProb: number };
    high: { n: number; hitRate: number; avgClaimedProb: number };
  };
}): string {
  const lines: string[] = [];
  lines.push(`# Backtest report`);
  lines.push("");
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push(`Fixtures analysed: ${d.fixturesCount}`);
  lines.push("");
  lines.push("## Aggregate");
  lines.push(`- Samples (settled markets): **${d.overall.n}**`);
  lines.push(`- Brier score: **${d.overall.brier.toFixed(4)}** _(lower is better; 0.25 = random for fair coin)_`);
  lines.push(`- Log-loss: **${d.overall.logLoss.toFixed(4)}**`);
  lines.push(
    `- Accuracy at p≥0.5: **${(d.overall.accuracy.pct * 100).toFixed(1)}%** (${d.overall.accuracy.hits}/${d.overall.accuracy.n})`,
  );
  lines.push("");
  lines.push("## Calibration");
  lines.push("");
  lines.push("| Bucket | n | Expected | Actual | Δ |");
  lines.push("|---|---|---|---|---|");
  for (const b of d.calib) {
    if (b.n === 0) continue;
    const exp = (b.expected * 100).toFixed(1);
    const act = (b.actual * 100).toFixed(1);
    const delta = ((b.actual - b.expected) * 100).toFixed(1);
    lines.push(
      `| ${(b.lo * 100).toFixed(0)}–${(b.hi * 100).toFixed(0)}% | ${b.n} | ${exp}% | ${act}% | ${delta}% |`,
    );
  }
  lines.push("");
  lines.push("## Per-market metrics");
  lines.push("");
  lines.push("| Market | n | Brier | Acc |");
  lines.push("|---|---|---|---|");
  for (const m of d.perMarket) {
    lines.push(
      `| ${m.key} | ${m.n} | ${m.brier.toFixed(4)} | ${(m.acc * 100).toFixed(1)}% |`,
    );
  }
  lines.push("");
  lines.push("## Pick strategy hit rate (low / medium / high)");
  lines.push("");
  lines.push("| Level | n | Hit rate | Avg claimed prob |");
  lines.push("|---|---|---|---|");
  for (const [label, m] of [
    ["Low", d.byLevel.low],
    ["Medium", d.byLevel.medium],
    ["High", d.byLevel.high],
  ] as const) {
    lines.push(
      `| ${label} | ${m.n} | ${(m.hitRate * 100).toFixed(1)}% | ${(m.avgClaimedProb * 100).toFixed(1)}% |`,
    );
  }
  lines.push("");
  lines.push("## Per-fixture picks");
  lines.push("");
  lines.push("| Fixture | League | Score | Level | Pick | Claimed | Result |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of d.picksLog) {
    const tag =
      r.outcome == null ? "n/d" : r.outcome ? "✓" : "✗";
    lines.push(
      `| ${r.homeName} vs ${r.awayName} | ${r.league} | ${r.score} | ${r.level} | ${r.label} | ${(r.p * 100).toFixed(1)}% | ${tag} |`,
    );
  }
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
