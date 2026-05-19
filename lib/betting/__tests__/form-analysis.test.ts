import { describe, it, expect } from "vitest";
import { analyseForm, buildStrengthMap, type OpponentTier } from "../form-analysis";
import type { ApiFixture, ApiStandingsResponse } from "@/lib/api-football/types";

function fx(args: {
  id: number;
  date: string;
  home: { id: number; name?: string };
  away: { id: number; name?: string };
  hg: number;
  ag: number;
}): ApiFixture {
  return {
    fixture: {
      id: args.id,
      referee: null,
      timezone: "UTC",
      date: args.date,
      timestamp: 0,
      status: { long: "FT", short: "FT", elapsed: 90 },
      venue: { id: null, name: null, city: null },
    },
    league: {
      id: 1,
      name: "L",
      country: "C",
      logo: "",
      season: 2024,
      round: "",
    },
    teams: {
      home: {
        id: args.home.id,
        name: args.home.name ?? "Home",
        logo: "",
        winner: args.hg > args.ag ? true : args.hg === args.ag ? null : false,
      },
      away: {
        id: args.away.id,
        name: args.away.name ?? "Away",
        logo: "",
        winner: args.ag > args.hg ? true : args.hg === args.ag ? null : false,
      },
    },
    goals: { home: args.hg, away: args.ag },
    score: {
      halftime: { home: 0, away: 0 },
      fulltime: { home: args.hg, away: args.ag },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  };
}

function tier(map: Record<number, OpponentTier>): Map<number, OpponentTier> {
  return new Map(Object.entries(map).map(([k, v]) => [Number(k), v]));
}

describe("analyseForm", () => {
  it("returns empty notes and zero counters with no fixtures", () => {
    const r = analyseForm([], 1, new Map());
    expect(r.games.length).toBe(0);
    expect(r.notes.length).toBe(0);
    expect(r.wins + r.draws + r.loses).toBe(0);
  });

  it("counts wins/draws/losses correctly", () => {
    const me = 1;
    const games = [
      fx({ id: 1, date: "2024-01-01", home: { id: me }, away: { id: 2 }, hg: 2, ag: 1 }), // W
      fx({ id: 2, date: "2024-01-02", home: { id: 3 }, away: { id: me }, hg: 1, ag: 1 }), // D
      fx({ id: 3, date: "2024-01-03", home: { id: me }, away: { id: 4 }, hg: 0, ag: 2 }), // L
    ];
    const r = analyseForm(games, me, new Map());
    expect(r.wins).toBe(1);
    expect(r.draws).toBe(1);
    expect(r.loses).toBe(1);
  });

  it("quality-adjusts goals against opponent tier", () => {
    const me = 1;
    const games = [
      // 2 goals vs top team
      fx({ id: 1, date: "2024-01-01", home: { id: me }, away: { id: 2 }, hg: 2, ag: 0 }),
      // 2 goals vs bottom team
      fx({ id: 2, date: "2024-01-02", home: { id: me }, away: { id: 3 }, hg: 2, ag: 0 }),
    ];
    const r = analyseForm(
      games,
      me,
      tier({ 2: "top", 3: "bottom" }),
    );
    // Same raw goals, but quality-adjusted goal vs top > goal vs bottom.
    expect(r.games[0].qualityAdjustedGoalsFor).toBeGreaterThan(
      r.games[1].qualityAdjustedGoalsFor,
    );
  });

  it("detects upward trend when last-5 collected more points than previous-5", () => {
    const me = 1;
    const games: ApiFixture[] = [
      // newest 5 — all wins
      ...Array.from({ length: 5 }, (_, i) =>
        fx({ id: i + 1, date: `2024-02-${i + 1}`, home: { id: me }, away: { id: 99 }, hg: 2, ag: 0 }),
      ),
      // older 5 — all losses
      ...Array.from({ length: 5 }, (_, i) =>
        fx({ id: 10 + i, date: `2024-01-${i + 1}`, home: { id: me }, away: { id: 99 }, hg: 0, ag: 2 }),
      ),
    ];
    const r = analyseForm(games, me, new Map());
    expect(r.trend).toBe(1);
    expect(r.notes.some((n) => n.toLowerCase().includes("alta"))).toBe(true);
  });

  it("detects downward trend in the opposite case", () => {
    const me = 1;
    const games: ApiFixture[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        fx({ id: i + 1, date: `2024-02-${i + 1}`, home: { id: me }, away: { id: 99 }, hg: 0, ag: 2 }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        fx({ id: 10 + i, date: `2024-01-${i + 1}`, home: { id: me }, away: { id: 99 }, hg: 2, ag: 0 }),
      ),
    ];
    const r = analyseForm(games, me, new Map());
    expect(r.trend).toBe(-1);
    expect(r.notes.some((n) => n.toLowerCase().includes("queda"))).toBe(true);
  });

  it("isHome flag matches the fixture orientation", () => {
    const me = 1;
    const games = [
      fx({ id: 1, date: "2024-01-01", home: { id: me }, away: { id: 2 }, hg: 1, ag: 0 }),
      fx({ id: 2, date: "2024-01-02", home: { id: 2 }, away: { id: me }, hg: 0, ag: 1 }),
    ];
    const r = analyseForm(games, me, new Map());
    expect(r.games[0].isHome).toBe(true);
    expect(r.games[1].isHome).toBe(false);
  });
});

describe("buildStrengthMap", () => {
  function makeStandings(ranked: number[]): ApiStandingsResponse {
    return {
      league: {
        id: 1,
        name: "L",
        country: "C",
        logo: "",
        flag: "",
        season: 2024,
        standings: [
          ranked.map((teamId, idx) => ({
            rank: idx + 1,
            team: { id: teamId, name: `T${teamId}`, logo: "" },
            points: 0,
            goalsDiff: 0,
            group: "",
            form: null,
            status: "",
            description: null,
            all: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
            home: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
            away: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
            update: "",
          })),
        ],
      },
    };
  }

  it("buckets teams into top / mid / bottom thirds", () => {
    // 9 teams: top = ranks 1-3, mid = 4-6, bottom = 7-9
    const standings = makeStandings([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    const map = buildStrengthMap(standings);
    expect(map.get(10)).toBe("top");
    expect(map.get(30)).toBe("top");
    expect(map.get(50)).toBe("mid");
    expect(map.get(70)).toBe("bottom");
    expect(map.get(90)).toBe("bottom");
  });

  it("returns an empty map when standings are null", () => {
    const map = buildStrengthMap(null);
    expect(map.size).toBe(0);
  });
});
