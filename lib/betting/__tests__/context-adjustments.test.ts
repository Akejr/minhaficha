import { describe, it, expect } from "vitest";
import { computeContextAdjustment } from "../context-adjustments";
import type {
  ApiFixture,
  ApiInjury,
} from "@/lib/api-football/types";

function fixtureFor(timestamp: number): ApiFixture {
  return {
    fixture: {
      id: 1,
      referee: null,
      timezone: "UTC",
      date: new Date(timestamp * 1000).toISOString(),
      timestamp,
      status: { long: "NS", short: "NS", elapsed: null },
      venue: { id: null, name: null, city: null },
    },
    league: { id: 1, name: "L", country: "C", logo: "", season: 2024, round: "" },
    teams: {
      home: { id: 10, name: "Casa", logo: "", winner: null },
      away: { id: 20, name: "Fora", logo: "", winner: null },
    },
    goals: { home: null, away: null },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  };
}

function pastFixture(teamId: number, daysAgo: number, baseTimestamp: number): ApiFixture {
  const ts = baseTimestamp - daysAgo * 24 * 60 * 60;
  return {
    fixture: {
      id: ts,
      referee: null,
      timezone: "UTC",
      date: new Date(ts * 1000).toISOString(),
      timestamp: ts,
      status: { long: "FT", short: "FT", elapsed: 90 },
      venue: { id: null, name: null, city: null },
    },
    league: { id: 1, name: "L", country: "C", logo: "", season: 2024, round: "" },
    teams: {
      home: { id: teamId, name: "T", logo: "", winner: null },
      away: { id: 999, name: "X", logo: "", winner: null },
    },
    goals: { home: 1, away: 0 },
    score: {
      halftime: { home: 0, away: 0 },
      fulltime: { home: 1, away: 0 },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  };
}

function injury(teamId: number, type = "Missing Fixture"): ApiInjury {
  return {
    player: { id: Math.random(), name: "P", photo: "", type, reason: "" },
    team: { id: teamId, name: "T", logo: "" },
    fixture: { id: 1, date: "" },
    league: { id: 1, season: 2024, name: "", country: "", logo: "" },
  };
}

describe("computeContextAdjustment", () => {
  const baseTs = 1_700_000_000;

  it("returns neutral factors when no signals exist", () => {
    const adj = computeContextAdjustment({
      fixture: fixtureFor(baseTs),
      homeRecent: [],
      awayRecent: [],
      homeInjuries: [],
      awayInjuries: [],
    });
    expect(adj.homeLambdaFactor).toBeCloseTo(1, 6);
    expect(adj.awayLambdaFactor).toBeCloseTo(1, 6);
    expect(adj.notes.length).toBe(0);
  });

  it("penalises attack and bumps opponent's λ when many injuries", () => {
    const adj = computeContextAdjustment({
      fixture: fixtureFor(baseTs),
      homeRecent: [],
      awayRecent: [],
      homeInjuries: [injury(10), injury(10), injury(10), injury(10)],
      awayInjuries: [],
    });
    // Home injured → home attack down, away λ up (more vulnerable opponent
    // for the AWAY side — but careful, formula multiplies the AWAY team's
    // factor by HOME's vulnerability, which goes up).
    expect(adj.homeLambdaFactor).toBeLessThan(1);
    expect(adj.awayLambdaFactor).toBeGreaterThan(1);
    expect(adj.notes.some((n) => n.includes("Casa"))).toBe(true);
  });

  it("ignores 'Questionable' injuries", () => {
    const adj = computeContextAdjustment({
      fixture: fixtureFor(baseTs),
      homeRecent: [],
      awayRecent: [],
      homeInjuries: [injury(10, "Questionable"), injury(10, "Questionable")],
      awayInjuries: [],
    });
    expect(adj.homeLambdaFactor).toBeCloseTo(1);
    expect(adj.awayLambdaFactor).toBeCloseTo(1);
  });

  it("penalises short rest (<3 days)", () => {
    const adj = computeContextAdjustment({
      fixture: fixtureFor(baseTs),
      homeRecent: [pastFixture(10, 1, baseTs)],
      awayRecent: [],
      homeInjuries: [],
      awayInjuries: [],
    });
    expect(adj.homeLambdaFactor).toBeLessThan(1);
    expect(adj.awayLambdaFactor).toBeCloseTo(1);
    expect(adj.notes.some((n) => n.includes("desgaste") || n.includes("dias"))).toBe(true);
  });

  it("bumps lambda for very long rest (>9 days)", () => {
    const adj = computeContextAdjustment({
      fixture: fixtureFor(baseTs),
      homeRecent: [pastFixture(10, 14, baseTs)],
      awayRecent: [],
      homeInjuries: [],
      awayInjuries: [],
    });
    expect(adj.homeLambdaFactor).toBeGreaterThan(1);
  });
});
