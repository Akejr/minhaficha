import type { AnalysisPayload } from "@/lib/betting";
import type { AnalysisOutput, RiskLevel } from "@/lib/openai/analyze";
import type { Bet, MatchAnalysis, RiskLevel as MockRisk, Stat } from "./mock-analysis";

/**
 * Map the (deterministic payload + AI output) pair into the shape used by
 * the existing UI components. Keeps the screen layout untouched while we
 * swap data sources between mocks and real fixtures.
 */
export function mapAnalysisToMatchAnalysis(
  payload: AnalysisPayload,
  ai: AnalysisOutput,
): MatchAnalysis {
  const bets: Bet[] = ai.bets.map((b) => ({
    riskLevel: toMockRisk(b.riskLevel),
    market: b.marketLabel,
    pick: b.marketLabel,
    probability: Math.round(b.probability * 100),
    rationale: b.rationale,
  }));

  const stats: Stat[] = buildStats(payload);

  return {
    matchId: String(payload.fixture.id),
    homeTeam: payload.teams.home.name,
    awayTeam: payload.teams.away.name,
    homeLogo: payload.teams.home.logo,
    awayLogo: payload.teams.away.logo,
    competition: payload.fixture.league,
    kickoffLabel: formatKickoff(payload.fixture.kickoff),
    status: "scheduled",
    confidence: Math.round(ai.confidence * 100),
    aiSummary: ai.summary,
    bets,
    stats,
  };
}

function toMockRisk(r: RiskLevel): MockRisk {
  return r;
}

function formatKickoff(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

function buildStats(payload: AnalysisPayload): Stat[] {
  const home = payload.history.homeSeason;
  const away = payload.history.awaySeason;
  const homeForm = payload.history.homeForm;
  const awayForm = payload.history.awayForm;
  const stats: Stat[] = [];

  if (home && away) {
    stats.push(
      {
        label: "Aproveitamento na temporada",
        homeValue: `${home.wins}V ${home.draws}E ${home.loses}D`,
        awayValue: `${away.wins}V ${away.draws}E ${away.loses}D`,
      },
      {
        label: "Gols marcados por jogo",
        homeValue: home.goalsForAvg.toFixed(2),
        awayValue: away.goalsForAvg.toFixed(2),
      },
      {
        label: "Gols sofridos por jogo",
        homeValue: home.goalsAgainstAvg.toFixed(2),
        awayValue: away.goalsAgainstAvg.toFixed(2),
      },
      {
        label: "Jogos sem sofrer gol",
        homeValue: String(home.cleanSheets),
        awayValue: String(away.cleanSheets),
      },
    );
  }

  if (homeForm.played > 0 && awayForm.played > 0) {
    stats.push({
      label: `Últimos ${Math.max(homeForm.played, awayForm.played)} jogos`,
      homeValue: `${homeForm.wins}V ${homeForm.draws}E ${homeForm.loses}D`,
      awayValue: `${awayForm.wins}V ${awayForm.draws}E ${awayForm.loses}D`,
    });
  }

  if (payload.history.h2h) {
    stats.push({
      label: `Confrontos diretos (${payload.history.h2h.played})`,
      homeValue: `${payload.history.h2h.homeWins}V`,
      awayValue: `${payload.history.h2h.awayWins}V · ${payload.history.h2h.draws}E`,
    });
  }

  return stats;
}
