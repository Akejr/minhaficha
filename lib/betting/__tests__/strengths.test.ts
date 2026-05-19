import { describe, it, expect } from "vitest";
import {
  computeStrengths,
  estimateLeaguePrior,
  lambdasFromStrengths,
  teamSeasonRates,
  type TeamSeasonRates,
} from "../strengths";
import type { ApiTeamStatistics } from "@/lib/api-football/types";

function makeStats(overrides: Partial<ApiTeamStatistics> = {}): ApiTeamStatistics {
  return {
    league: { id: 1, name: "L", country: "C", logo: "", season: 2024, round: "" },
    team: { id: 10, name: "T", logo: "" },
    fixtures: {
      played: { home: 10, away: 10, total: 20 },
      wins: { home: 6, away: 4, total: 10 },
      draws: { home: 2, away: 3, total: 5 },
      loses: { home: 2, away: 3, total: 5 },
    },
    goals: {
      for: {
        total: { home: 18, away: 12, total: 30 },
        average: { home: "1.80", away: "1.20", total: "1.50" },
        minute: {},
      },
      against: {
        total: { home: 8, away: 14, total: 22 },
        average: { home: "0.80", away: "1.40", total: "1.10" },
        minute: {},
      },
    },
    clean_sheet: { home: 4, away: 2, total: 6 },
    failed_to_score: { home: 1, away: 3, total: 4 },
    form: "WWDLW",
    ...overrides,
  };
}

describe("estimateLeaguePrior", () => {
  it("falls back to prior when no team data", () => {
    const p = estimateLeaguePrior(null, null);
    expect(p.source).toBe("prior-only");
    expect(p.goalsHomeLeg).toBeCloseTo(1.5);
    expect(p.goalsAwayLeg).toBeCloseTo(1.2);
  });

  it("shrinks toward prior when sample is small", () => {
    const home = makeStats({
      goals: {
        for: { total: { home: 9, away: 6, total: 15 }, average: { home: "3.00", away: "2.00", total: "2.50" }, minute: {} },
        against: { total: { home: 0, away: 6, total: 6 }, average: { home: "0.00", away: "2.00", total: "1.00" }, minute: {} },
      },
      fixtures: { played: { home: 3, away: 3, total: 6 }, wins: { home: 3, away: 1, total: 4 }, draws: { home: 0, away: 1, total: 1 }, loses: { home: 0, away: 1, total: 1 } },
    });
    const p = estimateLeaguePrior(home, null);
    // Strong shrinkage at n=3 with k=12 — should still be near the prior.
    expect(p.goalsHomeLeg).toBeLessThan(2.0);
    expect(p.goalsHomeLeg).toBeGreaterThan(1.5);
  });
});

describe("computeStrengths + lambdasFromStrengths", () => {
  it("equal teams give λs equal to the league averages", () => {
    const prior = { goalsHomeLeg: 1.5, goalsAwayLeg: 1.2, source: "prior-only" as const };
    const equalRates: TeamSeasonRates = {
      forHomeLeg: 1.5,
      forAwayLeg: 1.2,
      againstHomeLeg: 1.2,
      againstAwayLeg: 1.5,
      matchesHomeLeg: 30,
      matchesAwayLeg: 30,
    };
    const s = computeStrengths(equalRates, equalRates, prior);
    const { lambdaHome, lambdaAway } = lambdasFromStrengths(s, prior);
    expect(lambdaHome).toBeCloseTo(1.5, 1);
    expect(lambdaAway).toBeCloseTo(1.2, 1);
  });

  it("strong attacker / weak defender gives a high λ", () => {
    const prior = { goalsHomeLeg: 1.5, goalsAwayLeg: 1.2, source: "prior-only" as const };
    const strongAttacker: TeamSeasonRates = {
      forHomeLeg: 3.0,
      forAwayLeg: 2.0,
      againstHomeLeg: 0.5,
      againstAwayLeg: 1.0,
      matchesHomeLeg: 30,
      matchesAwayLeg: 30,
    };
    const weakDefender: TeamSeasonRates = {
      forHomeLeg: 1.0,
      forAwayLeg: 0.5,
      againstHomeLeg: 2.0,
      againstAwayLeg: 2.5,
      matchesHomeLeg: 30,
      matchesAwayLeg: 30,
    };
    const s = computeStrengths(strongAttacker, weakDefender, prior);
    const { lambdaHome } = lambdasFromStrengths(s, prior);
    expect(lambdaHome).toBeGreaterThan(2.5);
  });

  it("teamSeasonRates extracts averages correctly", () => {
    const stats = makeStats();
    const r = teamSeasonRates(stats)!;
    expect(r.forHomeLeg).toBeCloseTo(1.8);
    expect(r.forAwayLeg).toBeCloseTo(1.2);
    expect(r.againstHomeLeg).toBeCloseTo(0.8);
    expect(r.againstAwayLeg).toBeCloseTo(1.4);
  });
});
