/**
 * League priority table used to rank search results.
 *
 * Lower number = higher priority (i.e. shown first in the dropdown).
 * Anything not on the list falls into a default tier so it still appears
 * but after the prestigious leagues.
 *
 * Tuned for a BRAZILIAN audience: domestic Brazilian competitions and
 * CONMEBOL tournaments outrank European domestic leagues, because that's
 * what our users search for most. The intent is: when someone types
 * "flamengo", the Brasileirão / Libertadores fixture should come before a
 * friendly or a lower-division cup tie.
 */

const PRIORITY: Record<number, number> = {
  // Tier 0 — once-every-four-years prestige + Seleção
  1: 0, // FIFA World Cup
  9: 0, // Copa America
  4: 1, // UEFA EURO Championship

  // Tier 1 — Brazilian domestic football (our core market)
  71: 2, // Brasileirão Série A
  73: 3, // Copa do Brasil
  13: 3, // CONMEBOL Libertadores

  // Tier 2 — rest of South America + Brazilian second division
  11: 4, // CONMEBOL Sudamericana
  72: 5, // Brasileirão Série B
  475: 5, // Paulista - A1
  476: 5, // Carioca - Serie A

  // Tier 3 — top European club competitions (big audience in Brazil)
  2: 6, // UEFA Champions League
  3: 7, // UEFA Europa League
  848: 8, // UEFA Conference League

  // Tier 4 — Big Five domestic leagues
  39: 9, // Premier League (England)
  140: 9, // La Liga (Spain)
  135: 9, // Serie A (Italy)
  78: 9, // Bundesliga (Germany)
  61: 9, // Ligue 1 (France)

  // Tier 5 — strong secondary leagues
  94: 11, // Liga Portugal
  88: 11, // Eredivisie (Netherlands)
  128: 11, // Liga Profesional Argentina
  253: 11, // MLS (USA)

  // Tier 6 — large-but-secondary
  307: 13, // Saudi Pro League
  144: 13, // Belgium Pro League
  203: 13, // Turkish Süper Lig
  119: 13, // Danish Superliga
  286: 13, // Greek Super League
  113: 13, // Allsvenskan
  103: 13, // Eliteserien
  207: 13, // Swiss Super League
  179: 13, // Scottish Premiership
  262: 13, // Liga MX (Mexico)
};

const DEFAULT_PRIORITY = 50;

/**
 * Return the priority bucket for a league. Smaller is more important.
 */
export function leaguePriority(leagueId: number): number {
  return PRIORITY[leagueId] ?? DEFAULT_PRIORITY;
}
