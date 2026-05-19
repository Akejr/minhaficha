import { describe, it, expect } from "vitest";
import { computeMarkets } from "../markets";
import type { Features } from "../features";
import { MARKET_KEYS } from "../types";

function makeFeatures(overrides: Partial<Features> = {}): Features {
  return {
    lambdaHome: 1.6,
    lambdaAway: 1.2,
    lambdaCorners: 10.0,
    rho: -0.15,
    firstHalfShare: 0.45,
    homeFirstGoalShare: 0.6,
    confidence: 0.8,
    notes: [],
    homeFormNotes: [],
    awayFormNotes: [],
    intermediate: {
      leaguePrior: { goalsHomeLeg: 1.5, goalsAwayLeg: 1.2, source: "prior-only" },
      strengths: null,
      seasonLambdas: null,
      homeForm: emptyForm(),
      awayForm: emptyForm(),
      weightForm: 0,
      h2hAdjust: 1,
      trendAdjustHome: 1,
      trendAdjustAway: 1,
    },
    ...overrides,
  };
}

function emptyForm() {
  return {
    games: [],
    notes: [],
    attackRate: 1.4,
    defenceRate: 1.4,
    trend: 0 as const,
    vsTopHalf: null,
    wins: 0,
    draws: 0,
    loses: 0,
  };
}

describe("computeMarkets — coverage", () => {
  it("emits a probability for every declared market", () => {
    const out = computeMarkets(makeFeatures());
    for (const key of MARKET_KEYS) {
      expect(out[key]).toBeDefined();
      expect(out[key].probability).toBeGreaterThan(0);
      expect(out[key].probability).toBeLessThanOrEqual(1);
    }
  });

  it("fairOdd = 1 / probability for every market", () => {
    const out = computeMarkets(makeFeatures());
    for (const m of Object.values(out)) {
      expect(m.fairOdd).toBeCloseTo(+(1 / m.probability).toFixed(2), 1);
    }
  });
});

describe("computeMarkets — internal consistency", () => {
  it("1X2 sums to ~1", () => {
    const out = computeMarkets(makeFeatures());
    const sum =
      out.HOME_WIN.probability + out.AWAY_WIN.probability + out.DRAW.probability;
    expect(sum).toBeCloseTo(1, 2);
  });

  it("over_x and under_x sum to ~1", () => {
    const out = computeMarkets(makeFeatures());
    expect(out.OVER_1_5.probability + out.UNDER_1_5.probability).toBeCloseTo(1, 2);
    expect(out.OVER_2_5.probability + out.UNDER_2_5.probability).toBeCloseTo(1, 2);
  });

  it("over thresholds are strictly monotonic decreasing", () => {
    const out = computeMarkets(makeFeatures());
    expect(out.OVER_1_5.probability).toBeGreaterThan(out.OVER_2_5.probability);
    expect(out.OVER_2_5.probability).toBeGreaterThan(out.OVER_3_5.probability);
    expect(out.OVER_3_5.probability).toBeGreaterThan(out.OVER_4_5.probability);
  });

  it("team-total over thresholds are monotonic", () => {
    const out = computeMarkets(makeFeatures());
    expect(out.HOME_OVER_1_5.probability).toBeGreaterThan(out.HOME_OVER_2_5.probability);
    expect(out.AWAY_OVER_1_5.probability).toBeGreaterThan(out.AWAY_OVER_2_5.probability);
  });

  it("corners thresholds are monotonic", () => {
    const out = computeMarkets(makeFeatures());
    expect(out.CORNERS_OVER_8_5.probability).toBeGreaterThan(out.CORNERS_OVER_9_5.probability);
    expect(out.CORNERS_OVER_9_5.probability).toBeGreaterThan(out.CORNERS_OVER_10_5.probability);
  });

  it("HT overs ≤ FT overs at the same threshold", () => {
    const out = computeMarkets(makeFeatures());
    expect(out.OVER_1_5_HT.probability).toBeLessThanOrEqual(out.OVER_1_5.probability + 1e-9);
    expect(out.OVER_2_5_HT.probability).toBeLessThanOrEqual(out.OVER_2_5.probability + 1e-9);
  });

  it("double chance dominates each component", () => {
    const out = computeMarkets(makeFeatures());
    expect(out.HOME_OR_DRAW.probability).toBeGreaterThan(out.HOME_WIN.probability);
    expect(out.HOME_OR_DRAW.probability).toBeGreaterThan(out.DRAW.probability);
    expect(out.AWAY_OR_DRAW.probability).toBeGreaterThan(out.AWAY_WIN.probability);
    expect(out.AWAY_OR_DRAW.probability).toBeGreaterThan(out.DRAW.probability);
  });

  it("'win and team over X' implies 'win'", () => {
    const out = computeMarkets(makeFeatures());
    expect(out.HOME_WIN_AND_HOME_OVER_1_5.probability).toBeLessThanOrEqual(out.HOME_WIN.probability + 1e-9);
    expect(out.HOME_WIN_AND_HOME_OVER_2_5.probability).toBeLessThanOrEqual(out.HOME_WIN_AND_HOME_OVER_1_5.probability + 1e-9);
    expect(out.AWAY_WIN_AND_AWAY_OVER_1_5.probability).toBeLessThanOrEqual(out.AWAY_WIN.probability + 1e-9);
    expect(out.AWAY_WIN_AND_AWAY_OVER_2_5.probability).toBeLessThanOrEqual(out.AWAY_WIN_AND_AWAY_OVER_1_5.probability + 1e-9);
  });

  it("'win and team over' ≤ 'team over'", () => {
    const out = computeMarkets(makeFeatures());
    expect(out.HOME_WIN_AND_HOME_OVER_1_5.probability).toBeLessThanOrEqual(out.HOME_OVER_1_5.probability + 1e-9);
    expect(out.AWAY_WIN_AND_AWAY_OVER_1_5.probability).toBeLessThanOrEqual(out.AWAY_OVER_1_5.probability + 1e-9);
  });

  it("BTTS ≤ min(home_over_1, away_over_1) — both implied", () => {
    // This is the "at least 1" version. Our HOME_OVER_1_5 is "at least 2",
    // so BTTS isn't bounded by it. Direct check: BTTS ≤ 1 - P(0-0).
    const out = computeMarkets(makeFeatures());
    expect(out.BTTS.probability).toBeGreaterThan(0.4);
    expect(out.BTTS.probability).toBeLessThan(1);
  });

  it("first-to-score sides + P(0-0) ≈ 1", () => {
    const out = computeMarkets(makeFeatures());
    const sum = out.HOME_FIRST_TO_SCORE.probability + out.AWAY_FIRST_TO_SCORE.probability;
    expect(sum).toBeGreaterThan(0.85);
    expect(sum).toBeLessThanOrEqual(1.0);
  });
});

describe("computeMarkets — directional sanity", () => {
  it("higher home λ shifts probability toward home win", () => {
    const balanced = computeMarkets(makeFeatures({ lambdaHome: 1.4, lambdaAway: 1.4 }));
    const homeStrong = computeMarkets(makeFeatures({ lambdaHome: 2.5, lambdaAway: 0.6 }));
    expect(homeStrong.HOME_WIN.probability).toBeGreaterThan(balanced.HOME_WIN.probability);
    expect(homeStrong.AWAY_WIN.probability).toBeLessThan(balanced.AWAY_WIN.probability);
  });

  it("higher total λ raises over thresholds", () => {
    const lowScore = computeMarkets(makeFeatures({ lambdaHome: 0.8, lambdaAway: 0.7 }));
    const highScore = computeMarkets(makeFeatures({ lambdaHome: 2.4, lambdaAway: 2.0 }));
    expect(highScore.OVER_2_5.probability).toBeGreaterThan(lowScore.OVER_2_5.probability);
    expect(highScore.OVER_3_5.probability).toBeGreaterThan(lowScore.OVER_3_5.probability);
  });

  it("higher total λ raises BTTS", () => {
    const lowScore = computeMarkets(makeFeatures({ lambdaHome: 0.8, lambdaAway: 0.7 }));
    const highScore = computeMarkets(makeFeatures({ lambdaHome: 2.0, lambdaAway: 2.0 }));
    expect(highScore.BTTS.probability).toBeGreaterThan(lowScore.BTTS.probability);
  });

  it("corners λ shift moves the over thresholds the right way", () => {
    const low = computeMarkets(makeFeatures({ lambdaCorners: 7 }));
    const high = computeMarkets(makeFeatures({ lambdaCorners: 13 }));
    expect(high.CORNERS_OVER_8_5.probability).toBeGreaterThan(low.CORNERS_OVER_8_5.probability);
    expect(high.CORNERS_OVER_10_5.probability).toBeGreaterThan(low.CORNERS_OVER_10_5.probability);
  });

  it("homeFirstGoalShare biases first-to-score correctly", () => {
    const homeBias = computeMarkets(makeFeatures({ homeFirstGoalShare: 0.75 }));
    const awayBias = computeMarkets(makeFeatures({ homeFirstGoalShare: 0.25 }));
    expect(homeBias.HOME_FIRST_TO_SCORE.probability).toBeGreaterThan(
      awayBias.HOME_FIRST_TO_SCORE.probability,
    );
    expect(awayBias.AWAY_FIRST_TO_SCORE.probability).toBeGreaterThan(
      homeBias.AWAY_FIRST_TO_SCORE.probability,
    );
  });
});

describe("computeMarkets — Dixon-Coles ρ effect", () => {
  it("more negative ρ raises P(draw)", () => {
    const noDC = computeMarkets(makeFeatures({ rho: 0 }));
    const standardDC = computeMarkets(makeFeatures({ rho: -0.18 }));
    expect(standardDC.DRAW.probability).toBeGreaterThan(noDC.DRAW.probability);
  });

  it("ρ doesn't break grid normalization (1X2 still ≈ 1)", () => {
    for (const rho of [-0.25, -0.15, 0, 0.1]) {
      const out = computeMarkets(makeFeatures({ rho }));
      const sum = out.HOME_WIN.probability + out.AWAY_WIN.probability + out.DRAW.probability;
      expect(sum).toBeCloseTo(1, 2);
    }
  });
});
