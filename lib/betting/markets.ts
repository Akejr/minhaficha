import {
  MARKETS,
  type MarketKey,
  type MarketProbability,
  type ProbabilityMap,
} from "./types";
import { clampProb, scoreGrid, sf } from "./poisson";
import type { Features } from "./features";

/**
 * Compute pre-match probabilities for every supported market.
 *
 * Score-based markets are derived from the joint Dixon-Coles grid, which
 * guarantees mutual consistency:
 *   - over/under at a given threshold sum to 1
 *   - 1X2 sums to 1
 *   - "win and team-over" ≤ "win"
 *   - first-to-score sides sum to ≤ 1 (the gap is P(0-0))
 *
 * Corner-based markets use a marginal Poisson on λ_corners.
 *
 * 1st-half markets use a separate marginal Poisson on (λH + λA) × firstHalfShare.
 */
export function computeMarkets(features: Features): ProbabilityMap {
  const { lambdaHome, lambdaAway, lambdaCorners, rho, firstHalfShare } = features;

  const grid = scoreGrid(lambdaHome, lambdaAway, rho, 10);

  /** Sum cells matching a predicate over the (final) score. */
  const sumIf = (pred: (h: number, a: number) => boolean): number => {
    let p = 0;
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        if (pred(i, j)) p += grid[i][j];
      }
    }
    return clampProb(p);
  };

  const sumOverTotal = (n: number) =>
    sumIf((h, a) => h + a >= Math.ceil(n));
  const sumUnderTotal = (n: number) =>
    sumIf((h, a) => h + a <= Math.floor(n));

  // --- 1X2 ---
  const homeWin = sumIf((h, a) => h > a);
  const awayWin = sumIf((h, a) => a > h);
  const draw = sumIf((h, a) => h === a);

  // --- Double chance ---
  const homeOrDraw = clampProb(homeWin + draw);
  const awayOrDraw = clampProb(awayWin + draw);

  // --- Total goals (full match) ---
  const over15 = sumOverTotal(2);
  const over25 = sumOverTotal(3);
  const over35 = sumOverTotal(4);
  const over45 = sumOverTotal(5);
  const under15 = sumUnderTotal(1);
  const under25 = sumUnderTotal(2);

  // --- 1st half goals (independent Poisson on the half) ---
  const ht_lambda = (lambdaHome + lambdaAway) * firstHalfShare;
  const overHT_15 = clampProb(sf(1, ht_lambda));
  const overHT_25 = clampProb(sf(2, ht_lambda));

  // --- Team totals ---
  const homeOver15 = sumIf((h, _a) => h >= 2);
  const homeOver25 = sumIf((h, _a) => h >= 3);
  const awayOver15 = sumIf((_h, a) => a >= 2);
  const awayOver25 = sumIf((_h, a) => a >= 3);

  // --- BTTS ---
  const btts = sumIf((h, a) => h >= 1 && a >= 1);

  // --- Result + team total combos ---
  const homeWinAndHomeOver15 = sumIf((h, a) => h > a && h >= 2);
  const homeWinAndHomeOver25 = sumIf((h, a) => h > a && h >= 3);
  const awayWinAndAwayOver15 = sumIf((h, a) => a > h && a >= 2);
  const awayWinAndAwayOver25 = sumIf((h, a) => a > h && a >= 3);

  // --- First to score (pre-match) ---
  // P(home scores first) = P(at least 1 goal) × λH / (λH + λA).
  // We compute "any goal" from the grid for consistency with Dixon-Coles.
  const anyGoal = clampProb(1 - sumIf((h, a) => h === 0 && a === 0));
  const homeFirst = clampProb(anyGoal * features.homeFirstGoalShare);
  const awayFirst = clampProb(anyGoal * (1 - features.homeFirstGoalShare));

  // --- Corners ---
  const cornersOver = (n: number) =>
    clampProb(sf(Math.floor(n), lambdaCorners));
  const corners85 = cornersOver(8.5);
  const corners95 = cornersOver(9.5);
  const corners105 = cornersOver(10.5);

  const probs: Record<MarketKey, number> = {
    HOME_WIN: homeWin,
    AWAY_WIN: awayWin,
    DRAW: draw,
    HOME_OR_DRAW: homeOrDraw,
    AWAY_OR_DRAW: awayOrDraw,
    OVER_1_5: over15,
    OVER_2_5: over25,
    OVER_3_5: over35,
    OVER_4_5: over45,
    UNDER_1_5: under15,
    UNDER_2_5: under25,
    OVER_1_5_HT: overHT_15,
    OVER_2_5_HT: overHT_25,
    HOME_OVER_1_5: homeOver15,
    HOME_OVER_2_5: homeOver25,
    AWAY_OVER_1_5: awayOver15,
    AWAY_OVER_2_5: awayOver25,
    BTTS: btts,
    HOME_WIN_AND_HOME_OVER_1_5: homeWinAndHomeOver15,
    HOME_WIN_AND_HOME_OVER_2_5: homeWinAndHomeOver25,
    AWAY_WIN_AND_AWAY_OVER_1_5: awayWinAndAwayOver15,
    AWAY_WIN_AND_AWAY_OVER_2_5: awayWinAndAwayOver25,
    HOME_FIRST_TO_SCORE: homeFirst,
    AWAY_FIRST_TO_SCORE: awayFirst,
    CORNERS_OVER_8_5: corners85,
    CORNERS_OVER_9_5: corners95,
    CORNERS_OVER_10_5: corners105,
  };

  const out = {} as ProbabilityMap;
  for (const key of Object.keys(probs) as MarketKey[]) {
    const p = probs[key];
    const mp: MarketProbability = {
      key,
      label: MARKETS[key].label,
      category: MARKETS[key].category,
      probability: p,
      fairOdd: +(1 / p).toFixed(2),
    };
    out[key] = mp;
  }
  return out;
}
