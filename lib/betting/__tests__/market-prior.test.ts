import { describe, it, expect } from "vitest";
import { applyMarketPrior, extractMarketProbs } from "../market-prior";
import type { ApiOdds } from "@/lib/api-football/types";
import { MARKETS, type MarketKey, type MarketProbability, type ProbabilityMap } from "../types";

function fakeOdds(values: { name: string; value: string; odd: string }[]): ApiOdds {
  return {
    league: { id: 1, name: "L", country: "C", logo: "", flag: "", season: 2024, standings: [] } as any,
    fixture: { id: 1, timezone: "UTC", date: "", timestamp: 0 },
    bookmakers: [
      {
        id: 1,
        name: "BookA",
        bets: groupByName(values).map(([name, vs]) => ({
          id: 1,
          name,
          values: vs.map((v) => ({ value: v.value, odd: v.odd })),
        })),
      },
    ],
  };
}

function groupByName<T extends { name: string }>(values: T[]) {
  const m = new Map<string, T[]>();
  for (const v of values) {
    const arr = m.get(v.name) ?? [];
    arr.push(v);
    m.set(v.name, arr);
  }
  return [...m.entries()];
}

function makeProbabilityMap(overrides: Partial<Record<MarketKey, number>> = {}): ProbabilityMap {
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

describe("extractMarketProbs", () => {
  it("removes overround on a 1X2 group", () => {
    // Implied probs at these odds: ~1/2 + 1/3.5 + 1/5 = 0.50 + 0.286 + 0.20 = 0.986 (no vig)
    // We invent a small vig: 1.95, 3.4, 4.5  → 0.5128 + 0.2941 + 0.2222 = 1.0291
    const odds = [
      fakeOdds([
        { name: "Match Winner", value: "Home", odd: "1.95" },
        { name: "Match Winner", value: "Draw", odd: "3.4" },
        { name: "Match Winner", value: "Away", odd: "4.5" },
      ]),
    ];
    const m = extractMarketProbs(odds);
    const home = m.get("HOME_WIN")!;
    const draw = m.get("DRAW")!;
    const away = m.get("AWAY_WIN")!;
    expect(home).toBeDefined();
    expect(home.mean + draw.mean + away.mean).toBeCloseTo(1, 5);
  });

  it("returns empty map when odds list is empty", () => {
    const m = extractMarketProbs([]);
    expect(m.size).toBe(0);
  });

  it("handles BTTS yes-only entries", () => {
    const m = extractMarketProbs([
      fakeOdds([{ name: "Both Teams To Score", value: "Yes", odd: "1.7" }]),
    ]);
    const btts = m.get("BTTS");
    // Sole side, group sum = 0.588, normalised to 1 → mean 1.0.
    expect(btts).toBeDefined();
    expect(btts!.mean).toBeCloseTo(1.0, 5);
  });
});

describe("applyMarketPrior", () => {
  it("regresses probabilities toward market when bookmaker count > 0", () => {
    const probs = makeProbabilityMap({ HOME_WIN: 0.40 });
    const market = new Map<MarketKey, { mean: number; bookmakers: number }>([
      ["HOME_WIN", { mean: 0.55, bookmakers: 5 }],
    ]);
    const before = probs.HOME_WIN.probability;
    applyMarketPrior(probs, market);
    const after = probs.HOME_WIN.probability;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(0.55); // not fully copied — partial blend
  });

  it("does nothing when market has no entry", () => {
    const probs = makeProbabilityMap({ HOME_WIN: 0.40 });
    applyMarketPrior(probs, new Map());
    expect(probs.HOME_WIN.probability).toBeCloseTo(0.40);
  });

  it("weight saturates at 0.45 for many bookmakers", () => {
    const probs = makeProbabilityMap({ DRAW: 0.20 });
    const market = new Map<MarketKey, { mean: number; bookmakers: number }>([
      ["DRAW", { mean: 0.40, bookmakers: 50 }],
    ]);
    applyMarketPrior(probs, market);
    // 0.55·0.20 + 0.45·0.40 = 0.11 + 0.18 = 0.29
    expect(probs.DRAW.probability).toBeCloseTo(0.29, 2);
  });
});
