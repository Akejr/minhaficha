/**
 * League priority table used to rank search results.
 *
 * Lower number = higher priority (i.e. shown first in the dropdown).
 * Anything not on the list falls into a default tier so it still appears
 * but after the prestigious leagues.
 *
 * The intent is: when a user types something like "brasil" the FIFA World
 * Cup match should win over a Brasileirão match, the Brasileirão should win
 * over a third-tier domestic cup, and so on.
 */

const PRIORITY: Record<number, number> = {
  // Tier 0 — once-every-four-years prestige
  1: 0, // FIFA World Cup
  4: 0, // UEFA EURO Championship
  9: 0, // Copa America

  // Tier 1 — top European club competitions
  2: 1, // UEFA Champions League
  3: 2, // UEFA Europa League
  848: 3, // UEFA Conference League

  // Tier 2 — Big Five domestic leagues
  39: 4, // Premier League (England)
  140: 4, // La Liga (Spain)
  135: 4, // Serie A (Italy)
  78: 4, // Bundesliga (Germany)
  61: 4, // Ligue 1 (France)

  // Tier 3 — strong secondary leagues
  94: 6, // Liga Portugal
  88: 6, // Eredivisie (Netherlands)
  71: 6, // Brasileirão Série A
  13: 6, // CONMEBOL Libertadores
  11: 6, // CONMEBOL Sudamericana

  // Tier 4 — large-but-secondary
  253: 8, // MLS (USA)
  307: 8, // Saudi Pro League
  144: 8, // Belgium Pro League
  203: 8, // Turkish Süper Lig
  119: 8, // Danish Superliga
  286: 8, // Greek Super League
  113: 8, // Allsvenskan
  103: 8, // Eliteserien
  207: 8, // Swiss Super League
  179: 8, // Scottish Premiership
};

const DEFAULT_PRIORITY = 50;

/**
 * Return the priority bucket for a league. Smaller is more important.
 */
export function leaguePriority(leagueId: number): number {
  return PRIORITY[leagueId] ?? DEFAULT_PRIORITY;
}
