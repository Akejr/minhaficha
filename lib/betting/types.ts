/**
 * Market registry. Every market the system supports is declared here with:
 *   - key:           internal identifier
 *   - label:         human-friendly Portuguese (Angola/Portugal) label
 *   - category:      grouping for the UI
 *
 * Adding a new market = add a row here, then implement it inside
 * lib/betting/markets.ts.
 */

export const MARKET_KEYS = [
  // 1X2
  "HOME_WIN",
  "AWAY_WIN",
  "DRAW",
  // Double chance
  "HOME_OR_DRAW",
  "AWAY_OR_DRAW",
  // Total goals (full match)
  "OVER_1_5",
  "OVER_2_5",
  "OVER_3_5",
  "OVER_4_5",
  "UNDER_1_5",
  "UNDER_2_5",
  // Total goals (1st half)
  "OVER_1_5_HT",
  "OVER_2_5_HT",
  // Team totals
  "HOME_OVER_1_5",
  "HOME_OVER_2_5",
  "AWAY_OVER_1_5",
  "AWAY_OVER_2_5",
  // Both teams to score
  "BTTS",
  // Result + team total combos
  "HOME_WIN_AND_HOME_OVER_1_5",
  "HOME_WIN_AND_HOME_OVER_2_5",
  "AWAY_WIN_AND_AWAY_OVER_1_5",
  "AWAY_WIN_AND_AWAY_OVER_2_5",
  // First to score
  "HOME_FIRST_TO_SCORE",
  "AWAY_FIRST_TO_SCORE",
  // Corners
  "CORNERS_OVER_8_5",
  "CORNERS_OVER_9_5",
  "CORNERS_OVER_10_5",
] as const;

export type MarketKey = (typeof MARKET_KEYS)[number];

export type MarketCategory =
  | "match_result"
  | "double_chance"
  | "total_goals"
  | "first_half_goals"
  | "team_total"
  | "btts"
  | "result_plus_total"
  | "first_to_score"
  | "corners";

export type MarketDefinition = {
  key: MarketKey;
  label: string;
  category: MarketCategory;
};

export const MARKETS: Record<MarketKey, MarketDefinition> = {
  HOME_WIN: { key: "HOME_WIN", label: "Casa ganha", category: "match_result" },
  AWAY_WIN: { key: "AWAY_WIN", label: "Fora ganha", category: "match_result" },
  DRAW: { key: "DRAW", label: "Empate", category: "match_result" },

  HOME_OR_DRAW: {
    key: "HOME_OR_DRAW",
    label: "Casa ou empate (1X)",
    category: "double_chance",
  },
  AWAY_OR_DRAW: {
    key: "AWAY_OR_DRAW",
    label: "Fora ou empate (X2)",
    category: "double_chance",
  },

  OVER_1_5: { key: "OVER_1_5", label: "Mais de 1.5 golos", category: "total_goals" },
  OVER_2_5: { key: "OVER_2_5", label: "Mais de 2.5 golos", category: "total_goals" },
  OVER_3_5: { key: "OVER_3_5", label: "Mais de 3.5 golos", category: "total_goals" },
  OVER_4_5: { key: "OVER_4_5", label: "Mais de 4.5 golos", category: "total_goals" },
  UNDER_1_5: { key: "UNDER_1_5", label: "Menos de 1.5 golos", category: "total_goals" },
  UNDER_2_5: { key: "UNDER_2_5", label: "Menos de 2.5 golos", category: "total_goals" },

  OVER_1_5_HT: {
    key: "OVER_1_5_HT",
    label: "Mais de 1.5 golos na 1ª parte",
    category: "first_half_goals",
  },
  OVER_2_5_HT: {
    key: "OVER_2_5_HT",
    label: "Mais de 2.5 golos na 1ª parte",
    category: "first_half_goals",
  },

  HOME_OVER_1_5: {
    key: "HOME_OVER_1_5",
    label: "Casa marca +1.5 golos",
    category: "team_total",
  },
  HOME_OVER_2_5: {
    key: "HOME_OVER_2_5",
    label: "Casa marca +2.5 golos",
    category: "team_total",
  },
  AWAY_OVER_1_5: {
    key: "AWAY_OVER_1_5",
    label: "Fora marca +1.5 golos",
    category: "team_total",
  },
  AWAY_OVER_2_5: {
    key: "AWAY_OVER_2_5",
    label: "Fora marca +2.5 golos",
    category: "team_total",
  },

  BTTS: { key: "BTTS", label: "Ambas marcam", category: "btts" },

  HOME_WIN_AND_HOME_OVER_1_5: {
    key: "HOME_WIN_AND_HOME_OVER_1_5",
    label: "Casa ganha e marca +1.5",
    category: "result_plus_total",
  },
  HOME_WIN_AND_HOME_OVER_2_5: {
    key: "HOME_WIN_AND_HOME_OVER_2_5",
    label: "Casa ganha e marca +2.5",
    category: "result_plus_total",
  },
  AWAY_WIN_AND_AWAY_OVER_1_5: {
    key: "AWAY_WIN_AND_AWAY_OVER_1_5",
    label: "Fora ganha e marca +1.5",
    category: "result_plus_total",
  },
  AWAY_WIN_AND_AWAY_OVER_2_5: {
    key: "AWAY_WIN_AND_AWAY_OVER_2_5",
    label: "Fora ganha e marca +2.5",
    category: "result_plus_total",
  },

  HOME_FIRST_TO_SCORE: {
    key: "HOME_FIRST_TO_SCORE",
    label: "Casa marca primeiro",
    category: "first_to_score",
  },
  AWAY_FIRST_TO_SCORE: {
    key: "AWAY_FIRST_TO_SCORE",
    label: "Fora marca primeiro",
    category: "first_to_score",
  },

  CORNERS_OVER_8_5: {
    key: "CORNERS_OVER_8_5",
    label: "Mais de 8.5 cantos",
    category: "corners",
  },
  CORNERS_OVER_9_5: {
    key: "CORNERS_OVER_9_5",
    label: "Mais de 9.5 cantos",
    category: "corners",
  },
  CORNERS_OVER_10_5: {
    key: "CORNERS_OVER_10_5",
    label: "Mais de 10.5 cantos",
    category: "corners",
  },
};

export type MarketProbability = {
  key: MarketKey;
  label: string;
  category: MarketCategory;
  /** Estimated probability in [0, 1]. */
  probability: number;
  /** Implied fair odd = 1 / probability (no overround). */
  fairOdd: number;
};

export type ProbabilityMap = Record<MarketKey, MarketProbability>;
