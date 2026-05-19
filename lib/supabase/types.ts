/**
 * Hand-written types for the Supabase tables we use.
 *
 * Shape matches the format expected by @supabase/supabase-js generic
 * (Tables / Views / Functions / Enums / CompositeTypes). Generate from
 * `supabase gen types` later when the schema stabilises.
 */

export type Plan = "free" | "weekly" | "monthly";

export type Profile = {
  id: string;
  phone: string | null;
  display_name: string | null;
  plan: Plan;
  plan_expires_at: string | null;
  created_at: string;
};

export type MatchAnalysisRow = {
  fixture_id: number;
  payload: unknown;
  ai_output: unknown;
  kickoff_at: string;
  computed_at: string;
  expires_at: string;
};

export type UserAnalysisRow = {
  id: string;
  user_id: string;
  fixture_id: number;
  viewed_at: string;
  snapshot: unknown;
};

export type DailyUsageRow = {
  user_id: string;
  day: string; // YYYY-MM-DD
  analyses_count: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      match_analyses: {
        Row: MatchAnalysisRow;
        Insert: Omit<MatchAnalysisRow, "computed_at"> & {
          computed_at?: string;
        };
        Update: Partial<MatchAnalysisRow>;
        Relationships: [];
      };
      user_analyses: {
        Row: UserAnalysisRow;
        Insert: Omit<UserAnalysisRow, "id" | "viewed_at"> & {
          id?: string;
          viewed_at?: string;
        };
        Update: Partial<UserAnalysisRow>;
        Relationships: [];
      };
      daily_usage: {
        Row: DailyUsageRow;
        Insert: DailyUsageRow;
        Update: Partial<DailyUsageRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_daily_usage: {
        Args: { target_user: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
