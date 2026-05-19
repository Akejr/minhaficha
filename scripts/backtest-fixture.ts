/**
 * Backtest a single fixture from a "what if I had analysed this on day X"
 * perspective.
 *
 *   npx tsx scripts/backtest-fixture.ts <fixtureId> <asOfDate>
 *
 *   asOfDate is an ISO-ish date string. Anything before that date in the
 *   fetched recent / h2h history is kept; anything on/after is filtered out
 *   so the model "doesn't know" what hadn't happened yet.
 *
 * IMPORTANT — limitations:
 *   - /teams/statistics returns SEASON-AGGREGATED numbers including all rounds.
 *     Filtering them retroactively would require recomputing from scratch,
 *     which is out of scope for a quick check. So those numbers DO see the
 *     future. The recent-form pipeline IS filtered correctly though, and
 *     that's where most of the real signal comes from. This is good enough
 *     for a sanity check, not a peer-reviewed backtest.
 *
 * What the script prints:
 *   - the actual fixture (teams, league, kick-off, real result)
 *   - the model probabilities for every market
 *   - the 3 IA-style picks (low / medium / high) using just the suggestability
 *     filter — we DON'T call OpenAI here (deterministic + free)
 *   - whether each pick was correct against the real result
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { getFixture } from "../lib/api-football/queries";
import { extractFeatures } from "../lib/betting/features";
import { computeMarkets } from "../lib/betting/markets";
import { buildAnalysisPayload, type AnalysisPayload } from "../lib/betting/payload";
import { applyCalibration } from "../lib/betting/calibration";
import type { ApiFixture } from "../lib/api-football/types";
import {
  apiFootballGet,
} from "../lib/api-football/client";
import {
  getTeamStatistics,
  getStandings,
} from "../lib/api-football/queries";

type Args = { fixtureId: number; asOf: Date };

function parseArgs(): Args {
  const [idArg, asOfArg] = process.argv.slice(2);
  if (!idArg || !asOfArg) {
    console.error("Usage: npx tsx scripts/backtest-fixture.ts <fixtureId> <asOfDate>");
    console.error("Example: npx tsx scripts/backtest-fixture.ts 1391161 2026-05-09");
    process.exit(1);
  }
  const fixtureId = Number(idArg);
  const asOf = new Date(asOfArg);
  if (!Number.isFinite(fixtureId) || isNaN(asOf.getTime())) {
    console.error("Invalid fixtureId or asOfDate.");
    process.exit(1);
  }
  return { fixtureId, asOf };
}

/**
 * Re-implementation of fetchFixtureContext that filters recent fixtures and
 * H2H to only include matches BEFORE asOf. We can't filter season stats so
 * we fetch them as-is (see file-level note).
 */
async function buildAsOfContext(fixtureId: number, asOf: Date) {
  const fixture = await getFixture(fixtureId);
  if (!fixture) throw new Error(`Fixture ${fixtureId} not found`);

  const homeId = fixture.teams.home.id;
  const awayId = fixture.teams.away.id;
  const leagueId = fixture.league.id;
  const season = fixture.league.season;

  // Fetch generously then trim by date. We ask for last=50 because a team
  // may have many fixtures after `asOf` that we'll discard.
  const fetchRecent = (teamId: number) =>
    apiFootballGet<ApiFixture>("/fixtures", { team: teamId, last: 50 });
  const fetchH2H = () =>
    apiFootballGet<ApiFixture>("/fixtures/headtohead", { h2h: `${homeId}-${awayId}`, last: 50 });

  const [homeStats, awayStats, homeRecentRaw, awayRecentRaw, h2hRaw, standings] =
    await Promise.all([
      getTeamStatistics({ teamId: homeId, leagueId, season }).catch(() => null),
      getTeamStatistics({ teamId: awayId, leagueId, season }).catch(() => null),
      fetchRecent(homeId).catch(() => [] as ApiFixture[]),
      fetchRecent(awayId).catch(() => [] as ApiFixture[]),
      fetchH2H().catch(() => [] as ApiFixture[]),
      getStandings(leagueId, season).catch(() => null),
    ]);

  const before = (f: ApiFixture) => new Date(f.fixture.date).getTime() < asOf.getTime();
  const homeRecent = homeRecentRaw.filter(before).slice(0, 10);
  const awayRecent = awayRecentRaw.filter(before).slice(0, 10);
  const h2h = h2hRaw.filter(before).slice(0, 10);

  return {
    fixture,
    homeStats,
    awayStats,
    homeRecent,
    awayRecent,
    h2h,
    odds: [] as never[],
    standings,
    homeInjuries: [] as never[],
    awayInjuries: [] as never[],
  };
}

const SUGGESTABLE_MIN_PROB = 0.08;
const SUGGESTABLE_MAX_PROB = 0.80;

const RISK_BANDS = {
  low: { min: 0.65, max: 0.78 },
  medium: { min: 0.38, max: 0.58 },
  high: { min: 0.18, max: 0.32 },
} as const;

type Pick = {
  level: "low" | "medium" | "high";
  market: AnalysisPayload["markets"][number];
};

/**
 * Deterministic stand-in for the IA selection.
 * Picks the highest-probability suggestable market in each risk band, with
 * no two picks from the same category.
 */
function pickThree(payload: AnalysisPayload): Pick[] {
  const eligible = payload.markets.filter(
    (m) => m.probability >= SUGGESTABLE_MIN_PROB && m.probability <= SUGGESTABLE_MAX_PROB,
  );

  const usedCategories = new Set<string>();
  const picks: Pick[] = [];

  for (const level of ["low", "medium", "high"] as const) {
    const band = RISK_BANDS[level];
    const mid = (band.min + band.max) / 2;
    const candidates = eligible
      .filter((m) => !usedCategories.has(m.category))
      .filter((m) => m.probability >= band.min && m.probability <= band.max)
      .sort((a, b) => Math.abs(a.probability - mid) - Math.abs(b.probability - mid));

    // Honest emptiness — no fallback. Skip the level if no market fits the band.
    if (candidates.length === 0) continue;

    picks.push({ level, market: candidates[0] });
    usedCategories.add(candidates[0].category);
  }

  return picks;
}

/**
 * Determine if a market would have paid out given the actual final score.
 * Returns null when we can't tell from the fixture alone.
 */
function settleMarket(marketKey: string, hg: number, ag: number): boolean | null {
  const tot = hg + ag;
  switch (marketKey) {
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
    // Markets we can't settle from final score alone.
    case "OVER_1_5_HT":
    case "OVER_2_5_HT":
    case "HOME_FIRST_TO_SCORE":
    case "AWAY_FIRST_TO_SCORE":
    case "CORNERS_OVER_8_5":
    case "CORNERS_OVER_9_5":
    case "CORNERS_OVER_10_5":
      return null;
  }
  return null;
}

function settleHalfTimeMarket(marketKey: string, htHome: number | null, htAway: number | null): boolean | null {
  if (htHome == null || htAway == null) return null;
  const tot = htHome + htAway;
  if (marketKey === "OVER_1_5_HT") return tot >= 2;
  if (marketKey === "OVER_2_5_HT") return tot >= 3;
  return null;
}

async function main() {
  const { fixtureId, asOf } = parseArgs();

  console.log("─".repeat(72));
  console.log(`Backtest fixture ${fixtureId} as of ${asOf.toISOString().slice(0, 10)}`);
  console.log("─".repeat(72));

  const ctx = await buildAsOfContext(fixtureId, asOf);
  const fx = ctx.fixture;
  console.log(`${fx.teams.home.name} vs ${fx.teams.away.name}`);
  console.log(`${fx.league.name}, jornada "${fx.league.round}", ${fx.fixture.date}`);
  if (fx.fixture.status.short === "FT") {
    console.log(
      `Resultado real: ${fx.teams.home.name} ${fx.goals.home} - ${fx.goals.away} ${fx.teams.away.name}` +
        (fx.score.halftime.home != null
          ? ` (HT ${fx.score.halftime.home}-${fx.score.halftime.away})`
          : ""),
    );
  } else {
    console.log("Jogo ainda não terminou.");
  }
  console.log(`Dados usados:`);
  console.log(`  - últimos jogos do ${fx.teams.home.name}: ${ctx.homeRecent.length}`);
  console.log(`  - últimos jogos do ${fx.teams.away.name}: ${ctx.awayRecent.length}`);
  console.log(`  - confrontos diretos:                    ${ctx.h2h.length}`);
  console.log(`  - tabela da liga (standings):            ${ctx.standings ? "sim" : "não"}`);
  console.log(`  - stats da época:                        ${ctx.homeStats && ctx.awayStats ? "sim (vê o futuro)" : "parciais"}`);

  const features = extractFeatures(ctx);
  const markets = computeMarkets(features);
  applyCalibration(markets);
  const payload = buildAnalysisPayload(ctx, features, markets);

  console.log("");
  console.log("Notas (em casa):");
  for (const n of features.homeFormNotes) console.log(`  · ${n}`);
  console.log("");
  console.log("Notas (visitante):");
  for (const n of features.awayFormNotes) console.log(`  · ${n}`);

  console.log("");
  console.log("Top 12 mercados por probabilidade:");
  for (const m of payload.markets.slice(0, 12)) {
    console.log(`  ${(m.probability * 100).toFixed(1).padStart(5)}%  ${m.label}`);
  }

  const picks = pickThree(payload);
  console.log("");
  console.log("Sugestões (low / medium / high) — mesmas que o app teria mostrado:");
  for (const p of picks) {
    console.log(
      `  [${p.level.toUpperCase().padEnd(6)}]  ${p.market.label.padEnd(36)}  ${(p.market.probability * 100).toFixed(1)}%`,
    );
  }

  if (fx.fixture.status.short === "FT" && fx.goals.home != null && fx.goals.away != null) {
    console.log("");
    console.log("Resultado das sugestões:");
    for (const p of picks) {
      const ftSettled = settleMarket(p.market.key, fx.goals.home, fx.goals.away);
      const htSettled = settleHalfTimeMarket(
        p.market.key,
        fx.score.halftime.home,
        fx.score.halftime.away,
      );
      const ok = ftSettled ?? htSettled;
      const tag = ok == null ? "n/d (não dá pra apurar pelo placar)" : ok ? "ACERTOU ✓" : "ERROU ✗";
      console.log(`  [${p.level.toUpperCase().padEnd(6)}]  ${p.market.label.padEnd(36)}  ${tag}`);
    }
  }

  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
