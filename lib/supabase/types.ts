/**
 * Hand-written types for the Supabase tables we use.
 *
 * Shape matches the format expected by @supabase/supabase-js generic
 * (Tables / Views / Functions / Enums / CompositeTypes). Generate from
 * `supabase gen types` later when the schema stabilises.
 *
 * Auth note: there is no Supabase Auth here. The only credential is a
 * 12-character access code (see lib/access/). Nothing is keyed by user id.
 */

/** A row in access_codes — the app's only credential. */
export type AccessCodeRow = {
  code: string;
  created_at: string;
  /** NULL only for permanent codes. */
  expires_at: string | null;
  is_permanent: boolean;
  order_nsu: string | null;
  transaction_nsu: string | null;
  amount_cents: number | null;
  note: string | null;
  last_used_at: string | null;
};

export type CheckoutOrderStatus = "pending" | "paid";

export type CheckoutOrderRow = {
  order_nsu: string;
  status: CheckoutOrderStatus;
  amount_cents: number;
  created_at: string;
  paid_at: string | null;
  transaction_nsu: string | null;
  capture_method: string | null;
  receipt_url: string | null;
  access_code: string | null;
};

export type MatchAnalysisRow = {
  fixture_id: number;
  payload: unknown;
  ai_output: unknown;
  kickoff_at: string;
  computed_at: string;
  expires_at: string;
};

export type CodeAnalysisRow = {
  id: string;
  code: string;
  fixture_id: number;
  viewed_at: string;
  snapshot: unknown;
};

export type Database = {
  public: {
    Tables: {
      access_codes: {
        Row: AccessCodeRow;
        Insert: Omit<AccessCodeRow, "created_at"> & { created_at?: string };
        Update: Partial<AccessCodeRow>;
        Relationships: [];
      };
      checkout_orders: {
        Row: CheckoutOrderRow;
        Insert: Omit<CheckoutOrderRow, "created_at" | "status"> & {
          created_at?: string;
          status?: CheckoutOrderStatus;
        };
        Update: Partial<CheckoutOrderRow>;
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
      code_analyses: {
        Row: CodeAnalysisRow;
        Insert: Omit<CodeAnalysisRow, "id" | "viewed_at"> & {
          id?: string;
          viewed_at?: string;
        };
        Update: Partial<CodeAnalysisRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      purge_expired_codes: {
        Args: { grace_days?: number };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
