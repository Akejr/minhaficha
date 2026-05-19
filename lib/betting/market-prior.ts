import type { ApiOdds } from "@/lib/api-football/types";
import type { MarketKey, ProbabilityMap } from "./types";

/**
 * Bayesian-flavoured calibration against bookmaker odds.
 *
 * Bookmaker markets are highly efficient — closing lines beat most academic
 * models. We use them as a soft prior: when our model and the market agree,
 * nothing happens; when they diverge, we regress our estimate partway toward
 * the market.
 *
 * This bumps Brier score noticeably without making us "just copy the market"
 * — the weight on the prior is bounded so we keep our edge in places where
 * we genuinely outperform (under-the-radar markets, lower-data fixtures).
 *
 * Steps:
 *   1. Parse the odds payload, extract the markets we cover.
 *   2. Strip the overround so the bookmaker probabilities sum to 1 in each
 *      complete market group (1X2, over/under, BTTS yes/no).
 *   3. For each of our markets that has a market counterpart, replace
 *      our probability p with `(1-w)·p + w·p_market`, where w grows with
 *      how confident we are in the market (number of bookmakers reporting).
 *
 * If no odds were returned (off-season, obscure leagues) we leave probabilities
 * untouched.
 */

const MAX_MARKET_WEIGHT = 0.45;
const PER_BOOKMAKER_INCREMENT = 0.05;

type MarketProb = { mean: number; bookmakers: number };

/**
 * Map api-football's bet name + value into our internal market keys.
 * Names vary slightly by bookmaker so we use loose includes() matching.
 */
function classify(betName: string, value: string): MarketKey | null {
  const n = String(betName ?? "").toLowerCase();
  const v = String(value ?? "").toLowerCase();

  if (n.includes("match winner") || n === "1x2") {
    if (v === "home" || v === "1") return "HOME_WIN";
    if (v === "away" || v === "2") return "AWAY_WIN";
    if (v === "draw" || v === "x") return "DRAW";
  }
  if (n.includes("double chance")) {
    if (v.includes("home/draw") || v === "1x") return "HOME_OR_DRAW";
    if (v.includes("draw/away") || v === "x2") return "AWAY_OR_DRAW";
  }
  if (n.includes("goals over/under") || n === "over/under") {
    const m = /(over|under)\s*([\d.]+)/.exec(v);
    if (m) {
      const dir = m[1];
      const line = m[2];
      if (dir === "over") {
        if (line === "1.5") return "OVER_1_5";
        if (line === "2.5") return "OVER_2_5";
        if (line === "3.5") return "OVER_3_5";
        if (line === "4.5") return "OVER_4_5";
      } else {
        if (line === "1.5") return "UNDER_1_5";
        if (line === "2.5") return "UNDER_2_5";
      }
    }
  }
  if (n.includes("both teams to score") || n === "btts") {
    if (v === "yes" || v === "sim") return "BTTS";
  }
  if (n.includes("first half") && (n.includes("over") || n.includes("under"))) {
    const m = /(over|under)\s*([\d.]+)/.exec(v);
    if (m && m[1] === "over") {
      if (m[2] === "1.5") return "OVER_1_5_HT";
      if (m[2] === "2.5") return "OVER_2_5_HT";
    }
  }
  return null;
}

/** Convert decimal odd → implied probability with overround. */
function toProb(odd: string): number | null {
  const n = parseFloat(odd);
  if (!Number.isFinite(n) || n <= 1) return null;
  return 1 / n;
}

export function extractMarketProbs(
  odds: ApiOdds[],
): Map<MarketKey, MarketProb> {
  // Collect raw implied probs across all bookmakers.
  const collected = new Map<MarketKey, number[]>();
  for (const block of odds) {
    for (const bm of block.bookmakers) {
      // Strip overround per bet group within a single bookmaker. We do this
      // at bet-name granularity so the (Home, Draw, Away) triple normalises
      // to sum 1 BEFORE we average across books.
      const groupSum = new Map<string, number>();
      const perKey: { key: MarketKey; raw: number; group: string }[] = [];
      for (const bet of bm.bets) {
        for (const v of bet.values) {
          const key = classify(bet.name, v.value);
          if (!key) continue;
          const p = toProb(v.odd);
          if (p == null) continue;
          const group = `${bet.name}::${groupOf(key)}`;
          groupSum.set(group, (groupSum.get(group) ?? 0) + p);
          perKey.push({ key, raw: p, group });
        }
      }
      for (const x of perKey) {
        const sum = groupSum.get(x.group) ?? 0;
        const fair = sum > 0 ? x.raw / sum : x.raw;
        const arr = collected.get(x.key) ?? [];
        arr.push(fair);
        collected.set(x.key, arr);
      }
    }
  }

  const out = new Map<MarketKey, MarketProb>();
  for (const [key, list] of collected) {
    const mean = list.reduce((s, x) => s + x, 0) / list.length;
    out.set(key, { mean, bookmakers: list.length });
  }
  return out;
}

/**
 * Identify which "group" a market belongs to — we only de-vig within the
 * same group, so we don't normalise unrelated markets together.
 */
function groupOf(key: MarketKey): string {
  if (key === "HOME_WIN" || key === "AWAY_WIN" || key === "DRAW") return "1x2";
  if (key === "HOME_OR_DRAW" || key === "AWAY_OR_DRAW") return "dc";
  if (
    key === "OVER_1_5" ||
    key === "OVER_2_5" ||
    key === "OVER_3_5" ||
    key === "OVER_4_5" ||
    key === "UNDER_1_5" ||
    key === "UNDER_2_5"
  )
    return "totals";
  if (key === "BTTS") return "btts";
  if (key === "OVER_1_5_HT" || key === "OVER_2_5_HT") return "ht_totals";
  return key; // standalone
}

/**
 * Apply the market-prior calibration to our probability map IN PLACE.
 * Returns the keys that were adjusted plus the average shift, for diagnostics.
 */
export function applyMarketPrior(
  probs: ProbabilityMap,
  marketProbs: Map<MarketKey, MarketProb>,
): { adjusted: number; meanShift: number } {
  let totalShift = 0;
  let adjusted = 0;
  for (const key of Object.keys(probs) as MarketKey[]) {
    const market = marketProbs.get(key);
    if (!market) continue;
    const w = Math.min(MAX_MARKET_WEIGHT, market.bookmakers * PER_BOOKMAKER_INCREMENT);
    const p = probs[key].probability;
    const newP = (1 - w) * p + w * market.mean;
    probs[key] = {
      ...probs[key],
      probability: newP,
      fairOdd: +(1 / Math.max(newP, 1e-6)).toFixed(2),
    };
    totalShift += Math.abs(newP - p);
    adjusted++;
  }
  return {
    adjusted,
    meanShift: adjusted > 0 ? totalShift / adjusted : 0,
  };
}
