/**
 * Per-league backtest: analyse the N most recent finished fixtures from
 * EACH target league, then aggregate per-league and per-risk-level metrics.
 *
 *   npx tsx scripts/backtest-by-league.ts [--perLeague=15] [--days=120]
 *
 * Output:
 *   - aggregate metrics across all leagues
 *   - per-league hit rate breakdown
 *   - per-risk-level hit rate (low / medium / high) with calibration delta
 *   - per-league × per-risk-level table
 *   - markdown report saved to backtest-results/by-league-<timestamp>.md
 *
 * Disk cache:
 *   API responses are cached under .backtest-cache/ so re-runs are free.
 *
 * Caveats:
 *   /teams/statistics is rebuilt as-of asOf using rebuildSeasonStats, so
 *   data leakage is removed for that path. Recent fixtures and H2H are
 *   filtered correctly. Bookmaker odds are present but the Bayesian
 *   calibration is intentionally OFF (see lib/betting/index.ts).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { apiFootballGet } from "../lib/api-football/client";
import {
  getInjuries,
  getStandings,
  getTeamStatistics,
} from "../lib/api-football/queries";
import type {
  ApiFixture,
  ApiInjury,
  ApiOdds,
} from "../lib/api-football/types";
import { extractFeatures } from "../lib/betting/features";
import { computeMarkets } from "../lib/betting/markets";
import {
  buildAnalysisPayload,
  type AnalysisPayload,
} from "../lib/betting/payload";
import { rebuildSeasonStats } from "../lib/betting/season-rates";
import { applyCalibration } from "../lib/betting/calibration";

type League = { id: number; name: string };

const LEAGUES: League[] = [
  { id: 39, name: "Premier League" },
  { id: 140, name: "La Liga" },
  { id: 135, name: "Serie A" },
  { id: 78, name: "Bundesliga" },
  { id: 61, name: "Ligue 1" },
  { id: 94, name: "Liga Portugal" },
  { id: 88, name: "Eredivisie" },
  { id: 307, name: "Saudi Pro League" },
  { id: 253, name: "MLS" },
  { id: 2, name: "Champions League" },
  { id: 13, name: "Libertadores" },
];

const CACHE_DIR = path.resolve(".backtest-cache");
const RESULTS_DIR = path.resolve("backtest-results");

type Args = { perLeague: number; days: number };

function parseArgs(): Args {
  const out: Args = { perLeague: 15, days: 120 };
  for (const arg of process.argv.slice(2)) {
    const m = /^--(\w+)=(.+)$/.exec(arg);
    if (!m) continue;
    if (m[1] === "perLeague") out.perLeague = parseInt(m[2], 10);
    if (m[1] === "days") out.days = parseInt(m[2], 10);
  }
  return out;
}

async function ensureDirs() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const file = path.join(
    CACHE_DIR,
    key.replace(/[^a-z0-9_-]/gi, "_") + ".json",
  );
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    /* miss */
  }
  const v = await fn();
  await fs.writeFile(file, JSON.stringify(v));
  return v;
}

function seasonForDate(d: Date): number {
  return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

async function listFinishedFixturesForLeague(
  league: League,
  args: Args,
): Promise<ApiFixture[]> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - args.days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const seasons = new Set<number>();
  for (let d = new Date(from); d <= to; d.setMonth(d.getMonth() + 1)) {
    seasons.add(seasonForDate(d));
  }
  seasons.add(seasonForDate(to));

  const collected: ApiFixture[] = [];
  for (const season of seasons) {
    const list = await cached(
      `fixtures_${league.id}_${season}_${fmt(from)}_${fmt(to)}`,
      () =>
        apiFootballGet<ApiFixture>("/fixtures", {
          league: league.id,
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
        collected.push(f);
      }
    }
  }
  collected.sort((a, b) => b.fixture.timestamp - a.fixture.timestamp);
  return collected.slice(0, args.perLeague);
}

async function fetchAsOfContext(fixture: ApiFixture, asOf: Date) {
  const homeId = fixture.teams.home.id;
  const awayId = fixture.teams.away.id;
  const leagueId = fixture.league.id;
  const season = fixture.league.season;
  const cacheKey = (k: string) =>
    `${homeId}_${awayId}_${leagueId}_${season}_${k}`;

  const recent = (teamId: number) =>
    cached(`team_${teamId}_recent50`, () =>
      apiFootballGet<ApiFixture>("/fixtures", { team: teamId, last: 50 }),
    );
  const seasonFixtures = (teamId: number) =>
    cached(`team_${teamId}_season_${leagueId}_${season}`, () =>
      apiFootballGet<ApiFixture>("/fixtures", {
        team: teamId,
        league: leagueId,
        season,
      }),
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

  const before = (f: ApiFixture) =>
    new Date(f.fixture.date).getTime() < asOf.getTime();
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

const SUGG_MIN = 0.08;
const SUGG_MAX = 0.80;
const RISK = {
  low: { min: 0.65, max: 0.78 },
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
      .sort(
        (a, b) =>
          Math.abs(a.probability - mid) - Math.abs(b.probability - mid),
      );
    // Skip the level if the band is empty — no fallback. Honest emptiness
    // beats a forced bad pick (matches the new IA prompt rules).
    if (inBand.length === 0) continue;
    picks.push({ level, market: inBand[0] });
    used.add(inBand[0].category);
  }
  return picks;
}

function settle(key: string, fx: ApiFixture): boolean | null {
  const hg = fx.goals.home!;
  const ag = fx.goals.away!;
  const tot = hg + ag;
  switch (key) {
    case "HOME_WIN": return hg > ag;
    case "AWAY_WIN": return ag > hg;
    case "DRAW":     return hg === ag;
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
  if (key === "OVER_1_5_HT" || key === "OVER_2_5_HT") {
    if (fx.score.halftime.home == null || fx.score.halftime.away == null) return null;
    const ht = fx.score.halftime.home + fx.score.halftime.away;
    return key === "OVER_1_5_HT" ? ht >= 2 : ht >= 3;
  }
  return null;
}

type PickRow = {
  fixtureId: number;
  league: string;
  matchup: string;
  score: string;
  level: "low" | "medium" | "high";
  marketLabel: string;
  marketKey: string;
  probability: number;
  outcome: boolean | null;
};

async function main() {
  const args = parseArgs();
  await ensureDirs();
  console.log(
    `[backtest] ${LEAGUES.length} ligas × ${args.perLeague} jogos cada (look-back ${args.days} dias).`,
  );

  // Step 1: collect fixtures per league.
  type LeagueGroup = { league: League; fixtures: ApiFixture[] };
  const groups: LeagueGroup[] = [];
  for (const league of LEAGUES) {
    const fixtures = await listFinishedFixturesForLeague(league, args);
    console.log(`  ${league.name}: ${fixtures.length} jogos.`);
    groups.push({ league, fixtures });
  }

  // Step 2: analyse each fixture.
  const allPicks: PickRow[] = [];
  let i = 0;
  const totalFixtures = groups.reduce((s, g) => s + g.fixtures.length, 0);

  for (const { league, fixtures } of groups) {
    for (const fx of fixtures) {
      i++;
      const asOf = new Date(fx.fixture.timestamp * 1000);
      asOf.setUTCDate(asOf.getUTCDate() - 1);

      process.stdout.write(
        `[${String(i).padStart(3)}/${totalFixtures}] ${league.name} · ${fx.teams.home.name} vs ${fx.teams.away.name}…`,
      );
      try {
        const ctx = await fetchAsOfContext(fx, asOf);
        const features = extractFeatures(ctx);
        const markets = computeMarkets(features);
        // Apply the same empirical calibration the production pipeline uses.
        applyCalibration(markets);
        const payload = buildAnalysisPayload(ctx, features, markets);
        const picks = pickThree(payload);

        for (const p of picks) {
          allPicks.push({
            fixtureId: fx.fixture.id,
            league: league.name,
            matchup: `${fx.teams.home.name} vs ${fx.teams.away.name}`,
            score: `${fx.goals.home}-${fx.goals.away}`,
            level: p.level,
            marketLabel: p.market.label,
            marketKey: p.market.key,
            probability: p.market.probability,
            outcome: settle(p.market.key, fx),
          });
        }
        console.log(" ok");
      } catch (err) {
        console.log(` FAILED (${(err as Error).message})`);
      }
    }
  }

  // Step 3: aggregate.
  const settled = allPicks.filter((p) => p.outcome != null);
  const byLevel = (level: "low" | "medium" | "high") =>
    settled.filter((p) => p.level === level);
  const byLeague = (leagueName: string) =>
    settled.filter((p) => p.league === leagueName);

  type LevelStat = { n: number; hits: number; rate: number; avgClaimed: number };
  const levelStat = (rows: PickRow[]): LevelStat => {
    const hits = rows.filter((r) => r.outcome).length;
    const avgClaimed =
      rows.length === 0 ? 0 : rows.reduce((s, r) => s + r.probability, 0) / rows.length;
    return {
      n: rows.length,
      hits,
      rate: rows.length === 0 ? 0 : hits / rows.length,
      avgClaimed,
    };
  };

  const overall = {
    low: levelStat(byLevel("low")),
    medium: levelStat(byLevel("medium")),
    high: levelStat(byLevel("high")),
  };
  const totalHits = settled.filter((r) => r.outcome).length;
  const overallAcc = settled.length === 0 ? 0 : totalHits / settled.length;

  // Per-league × per-level matrix.
  const perLeague: { league: string; total: LevelStat; low: LevelStat; medium: LevelStat; high: LevelStat }[] = [];
  for (const g of groups) {
    const rows = byLeague(g.league.name);
    perLeague.push({
      league: g.league.name,
      total: levelStat(rows),
      low: levelStat(rows.filter((r) => r.level === "low")),
      medium: levelStat(rows.filter((r) => r.level === "medium")),
      high: levelStat(rows.filter((r) => r.level === "high")),
    });
  }

  // ---------- console output ----------
  console.log("\n═══ RESULTADO GLOBAL ═══");
  console.log(
    `Total de sugestões avaliadas: ${settled.length}  ·  acerto geral: ${(overallAcc * 100).toFixed(1)}%`,
  );
  for (const [name, s] of [
    ["BAIXO RISCO ", overall.low],
    ["MÉDIO RISCO ", overall.medium],
    ["ALTO RISCO  ", overall.high],
  ] as const) {
    if (s.n === 0) continue;
    const delta = (s.rate - s.avgClaimed) * 100;
    console.log(
      `${name}  acerto ${(s.rate * 100).toFixed(1)}%  (${s.hits}/${s.n})  ·  prometido ${(s.avgClaimed * 100).toFixed(1)}%  ·  Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp`,
    );
  }

  console.log("\n═══ POR LIGA ═══");
  console.log(
    "liga                  total       baixo       médio       alto",
  );
  for (const r of perLeague) {
    if (r.total.n === 0) {
      console.log(`${r.league.padEnd(20)}  sem dados`);
      continue;
    }
    const fmt = (s: LevelStat) =>
      s.n === 0 ? "  -  /  -  " : `${(s.rate * 100).toFixed(0).padStart(2)}% ${String(s.hits).padStart(2)}/${String(s.n).padStart(2)}`;
    console.log(
      `${r.league.padEnd(20)}  ${fmt(r.total)}  ${fmt(r.low)}  ${fmt(r.medium)}  ${fmt(r.high)}`,
    );
  }

  // ---------- markdown report ----------
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const md = generateReport({
    perLeagueLimit: args.perLeague,
    overall,
    overallAcc,
    settledCount: settled.length,
    perLeague,
    allPicks,
  });
  const file = path.join(RESULTS_DIR, `by-league-${ts}.md`);
  await fs.writeFile(file, md);
  console.log(`\nRelatório salvo em ${file}`);
}

function generateReport(d: {
  perLeagueLimit: number;
  overall: {
    low: { n: number; hits: number; rate: number; avgClaimed: number };
    medium: { n: number; hits: number; rate: number; avgClaimed: number };
    high: { n: number; hits: number; rate: number; avgClaimed: number };
  };
  overallAcc: number;
  settledCount: number;
  perLeague: {
    league: string;
    total: { n: number; hits: number; rate: number; avgClaimed: number };
    low: { n: number; hits: number; rate: number; avgClaimed: number };
    medium: { n: number; hits: number; rate: number; avgClaimed: number };
    high: { n: number; hits: number; rate: number; avgClaimed: number };
  }[];
  allPicks: PickRow[];
}): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`# Backtest por liga`);
  lines.push("");
  lines.push(`Data: ${new Date().toISOString()}`);
  lines.push(`Jogos por liga: ${d.perLeagueLimit}`);
  lines.push(`Total de sugestões avaliadas: **${d.settledCount}**`);
  lines.push(`Acerto geral: **${pct(d.overallAcc)}**`);
  lines.push("");

  lines.push("## Resumo por nível de risco");
  lines.push("");
  lines.push("| Nível | n | Acerto real | Probabilidade prometida | Diferença (pp) |");
  lines.push("|---|---|---|---|---|");
  for (const [name, s] of [
    ["Baixo", d.overall.low],
    ["Médio", d.overall.medium],
    ["Alto", d.overall.high],
  ] as const) {
    if (s.n === 0) {
      lines.push(`| ${name} | 0 | — | — | — |`);
      continue;
    }
    const delta = (s.rate - s.avgClaimed) * 100;
    const sign = delta >= 0 ? "+" : "";
    lines.push(
      `| ${name} | ${s.n} | ${pct(s.rate)} | ${pct(s.avgClaimed)} | ${sign}${delta.toFixed(1)} |`,
    );
  }
  lines.push("");

  lines.push("## Resumo por liga");
  lines.push("");
  lines.push("| Liga | n | Acerto geral | Baixo | Médio | Alto |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of d.perLeague) {
    if (r.total.n === 0) {
      lines.push(`| ${r.league} | 0 | — | — | — | — |`);
      continue;
    }
    const cell = (s: { n: number; hits: number; rate: number }) =>
      s.n === 0 ? "—" : `${pct(s.rate)} (${s.hits}/${s.n})`;
    lines.push(
      `| ${r.league} | ${r.total.n} | ${cell(r.total)} | ${cell(r.low)} | ${cell(r.medium)} | ${cell(r.high)} |`,
    );
  }
  lines.push("");

  lines.push("## Detalhe por jogo");
  lines.push("");
  lines.push("| Liga | Jogo | Resultado | Risco | Sugestão | Prometido | Acertou? |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of d.allPicks) {
    const tag = r.outcome == null ? "n/d" : r.outcome ? "✓" : "✗";
    lines.push(
      `| ${r.league} | ${r.matchup} | ${r.score} | ${r.level} | ${r.marketLabel} | ${pct(r.probability)} | ${tag} |`,
    );
  }
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
