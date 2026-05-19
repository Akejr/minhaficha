import { fetchFixtureContext } from "@/lib/api-football/queries";
import { extractFeatures } from "./features";
import { computeMarkets } from "./markets";
import { buildAnalysisPayload, type AnalysisPayload } from "./payload";
import { applyMarketPrior, extractMarketProbs } from "./market-prior";
import { applyCalibration } from "./calibration";

/**
 * High-level entry point.
 *
 *   analyzeFixture(fixtureId) → payload that can be:
 *     - displayed on the UI directly (markets list, λ, H2H summary)
 *     - sent verbatim to ChatGPT for the 3-bet narrative
 *
 * Pipeline:
 *   1. Fetch all data needed (API-Football).
 *   2. Extract features (λ, ρ, form, injuries, rest, etc.).
 *   3. Compute every market's probability (Dixon-Coles + Poisson).
 *   4. Apply empirical calibration per market (post-hoc shrinkage).
 *   5. Build the IA-ready payload.
 *
 * Note: market-prior calibration against bookmaker odds is implemented in
 * lib/betting/market-prior.ts but NOT applied here. Backtesting showed the
 * naive prior introduced calibration errors in the 70-80% bucket. Re-enable
 * once we have a more robust de-vigging strategy (e.g. requiring complete
 * 1X2 triples from at least 3 bookmakers).
 *
 * Throws if the fixture is unknown.
 */
export async function analyzeFixture(fixtureId: number): Promise<AnalysisPayload> {
  const ctx = await fetchFixtureContext(fixtureId);
  if (!ctx) {
    throw new Error(`Fixture ${fixtureId} not found on API-Football.`);
  }
  const features = extractFeatures(ctx);
  const markets = computeMarkets(features);
  // Empirical per-market shrinkage based on May-2026 backtest evidence.
  applyCalibration(markets);
  return buildAnalysisPayload(ctx, features, markets);
}

export { computeMarkets } from "./markets";
export { extractFeatures } from "./features";
export { buildAnalysisPayload } from "./payload";
export { applyMarketPrior, extractMarketProbs } from "./market-prior";
export { applyCalibration } from "./calibration";
export type { Features } from "./features";
export type { AnalysisPayload } from "./payload";
export * from "./types";
