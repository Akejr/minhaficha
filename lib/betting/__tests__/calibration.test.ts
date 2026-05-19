import { describe, it, expect } from "vitest";
import { applyCalibration } from "../calibration";
import { MARKETS, type MarketKey, type MarketProbability, type ProbabilityMap } from "../types";

function makeMap(overrides: Partial<Record<MarketKey, number>>): ProbabilityMap {
  const out = {} as ProbabilityMap;
  for (const key of Object.keys(MARKETS) as MarketKey[]) {
    const p = overrides[key] ?? 0.3;
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

describe("applyCalibration", () => {
  it("shrinks HOME_OR_DRAW (the known over-confident market)", () => {
    const probs = makeMap({ HOME_OR_DRAW: 0.7 });
    const before = probs.HOME_OR_DRAW.probability;
    applyCalibration(probs);
    const after = probs.HOME_OR_DRAW.probability;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0); // not zero
    expect(after).toBeCloseTo(0.7 * 0.88, 4);
  });

  it("does not touch OVER_1_5 (already calibrated)", () => {
    const probs = makeMap({ OVER_1_5: 0.73 });
    applyCalibration(probs);
    expect(probs.OVER_1_5.probability).toBeCloseTo(0.73);
  });

  it("recomputes fairOdd consistently", () => {
    const probs = makeMap({ HOME_OR_DRAW: 0.7 });
    applyCalibration(probs);
    const m = probs.HOME_OR_DRAW;
    expect(m.fairOdd).toBeCloseTo(+(1 / m.probability).toFixed(2), 1);
  });

  it("returns the list of adjusted keys", () => {
    const probs = makeMap({ HOME_OR_DRAW: 0.7 });
    const adjusted = applyCalibration(probs);
    expect(adjusted).toContain("HOME_OR_DRAW");
  });
});
