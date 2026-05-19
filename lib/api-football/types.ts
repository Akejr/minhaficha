/**
 * Subset of API-Football v3 response shapes we actually consume.
 * Full reference: https://www.api-football.com/documentation-v3
 */

export type ApiResponse<T> = {
  get: string;
  parameters: Record<string, string>;
  errors: unknown[];
  results: number;
  paging: { current: number; total: number };
  response: T;
};

export type ApiTeam = { id: number; name: string; logo: string };

export type ApiLeague = {
  id: number;
  name: string;
  country: string;
  logo: string;
  season: number;
  round: string;
};

export type ApiVenue = {
  id: number | null;
  name: string | null;
  city: string | null;
};

export type ApiFixture = {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    status: { long: string; short: string; elapsed: number | null };
    venue: ApiVenue;
  };
  league: ApiLeague;
  teams: {
    home: ApiTeam & { winner: boolean | null };
    away: ApiTeam & { winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
};

export type ApiFixtureStatistic = {
  team: ApiTeam;
  statistics: { type: string; value: number | string | null }[];
};

/** Endpoint /teams/statistics — full season aggregate for one team in one league. */
export type ApiTeamStatistics = {
  league: ApiLeague;
  team: ApiTeam;
  fixtures: {
    played: { home: number; away: number; total: number };
    wins: { home: number; away: number; total: number };
    draws: { home: number; away: number; total: number };
    loses: { home: number; away: number; total: number };
  };
  goals: {
    for: {
      total: { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
      minute: Record<
        string,
        { total: number | null; percentage: string | null }
      >;
    };
    against: {
      total: { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
      minute: Record<
        string,
        { total: number | null; percentage: string | null }
      >;
    };
  };
  clean_sheet: { home: number; away: number; total: number };
  failed_to_score: { home: number; away: number; total: number };
  /** First substring of "round" describing the form, e.g. "WWDLW". */
  form: string;
};

export type ApiH2HFixture = ApiFixture;

/** Endpoint /odds — bookmaker-aggregated odds (used as sanity check, not as source of truth). */
export type ApiOdds = {
  league: ApiLeague;
  fixture: { id: number; timezone: string; date: string; timestamp: number };
  bookmakers: {
    id: number;
    name: string;
    bets: {
      id: number;
      name: string;
      values: { value: string; odd: string }[];
    }[];
  }[];
};

/** Endpoint /standings — league table for a season. */
export type ApiStandingTeam = {
  rank: number;
  team: ApiTeam;
  points: number;
  goalsDiff: number;
  group: string;
  form: string | null;
  status: string;
  description: string | null;
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  home: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  away: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  update: string;
};

export type ApiStandingsResponse = {
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    /** Outer array = groups (e.g. CL group stage). Inner array = ranked teams. */
    standings: ApiStandingTeam[][];
  };
};


/** Endpoint /injuries — players unavailable for a fixture. */
export type ApiInjury = {
  player: {
    id: number;
    name: string;
    photo: string;
    type: string; // "Missing Fixture" | "Questionable"
    reason: string;
  };
  team: ApiTeam;
  fixture: { id: number; date: string };
  league: { id: number; season: number; name: string; country: string; logo: string };
};
