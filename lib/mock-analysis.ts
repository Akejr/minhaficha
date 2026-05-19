export type RiskLevel = "low" | "medium" | "high";

export type Bet = {
  riskLevel: RiskLevel;
  market: string;
  pick: string;
  probability: number;
  rationale: string;
};

export type Stat = {
  label: string;
  homeValue: string;
  awayValue: string;
};

export type MatchAnalysis = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  competition: string;
  kickoffLabel: string;
  status: "scheduled";
  aiSummary: string;
  confidence: number;
  bets: Bet[];
  stats: Stat[];
};

/**
 * Demo analyses kept for offline UI iteration. Real data is loaded by
 * lib/match-mapper.ts whenever the URL has a numeric fixtureId.
 */
export const mockAnalyses: Record<string, MatchAnalysis> = {};
