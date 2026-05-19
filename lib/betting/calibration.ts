import type { MarketKey, MarketProbability, ProbabilityMap } from "./types";

/**
 * Empirical post-hoc calibration per market.
 *
 * Backtest data (105 fixtures, 7 leagues, May 2026) showed our raw model
 * over-confident on some markets and well-calibrated on others. We apply a
 * per-market multiplier to bring real hit rate closer to the displayed
 * probability — the goal is honest calibration, not winning more bets.
 *
 * Methodology:
 *   - For each market with > 5 settled samples in the backtest, compute
 *     observed_hit_rate / model_prob.
 *   - Use that ratio (regularised toward 1.0) as the per-market shrinkage.
 *   - Markets with too few samples or no clear bias keep factor 1.0.
 *
 * The current factors are tuned from the May-2026 backtest. Re-run the
 * backtest periodically and update the table.
 *
 * Numerical effect: a market displayed at 70% with factor 0.85 will be
 * shown as 59.5%. If 56% is the long-run hit rate, that's much closer.
 */

type CalibrationEntry = {
  factor: number;
  /** Documentation of where this factor came from. */
  reason: string;
};

/**
 * IMPORTANT: only entries that have meaningful evidence. Missing markets
 * keep the model probability untouched.
 */
const CALIBRATION: Partial<Record<MarketKey, CalibrationEntry>> = {
  HOME_OR_DRAW: {
    factor: 0.88,
    reason:
      "Backtest 16 picks: hit 56% vs 70% claimed. Model under-weights away wins in lopsided fixtures.",
  },
  // OVER_2_5 had only 4 picks (too small to calibrate confidently). Leave alone.
  // OVER_1_5: 73% hit vs ~73% claimed → already calibrated.
  // AWAY_OR_DRAW: 89% hit vs ~62% claimed → UNDER-confident, but boosting
  //   bumps it into "obvious bet" territory we already filter, so we leave it.
  // HOME_WIN, AWAY_WIN: only 1 sample each in low-risk band; not enough.
};

/**
 * Apply calibration in-place to a probability map.
 * Returns the keys that were adjusted, for diagnostics.
 */
export function applyCalibration(probs: ProbabilityMap): MarketKey[] {
  const adjusted: MarketKey[] = [];
  for (const key of Object.keys(probs) as MarketKey[]) {
    const cal = CALIBRATION[key];
    if (!cal) continue;
    const old = probs[key].probability;
    const next = clampProb(old * cal.factor);
    probs[key] = {
      ...probs[key],
      probability: next,
      fairOdd: +(1 / Math.max(next, 1e-6)).toFixed(2),
    } satisfies MarketProbability;
    adjusted.push(key);
  }
  return adjusted;
}

function clampProb(p: number): number {
  if (!Number.isFinite(p)) return 0.005;
  return Math.min(0.995, Math.max(0.005, p));
}
