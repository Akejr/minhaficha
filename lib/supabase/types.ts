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
  /** What the code grants. Checkout always issues 'monthly'. */
  kind: "monthly" | "annual" | "lifetime";
  /** Where it came from. */
  source: "checkout" | "admin";
  /** Set when revoked; revoked codes never validate, permanent or not. */
  revoked_at: string | null;
};

/** Runtime settings editable from /admin (see lib/settings.ts). */
export type AppSettingRow = {
  key: string;
  value: unknown;
  updated_at: string;
};

export type EventRow = {
  id: number;
  created_at: string;
  type: string;
  code: string | null;
  fixture_id: number | null;
  order_nsu: string | null;
  amount_cents: number | null;
  is_free: boolean | null;
  ok: boolean | null;
  detail: string | null;
  path: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  meta: unknown;
};

export type CheckoutOrderStatus = "pending" | "paid";

/**
 * Ad attribution and reconciliation handles added by migration 005.
 *
 * Split out from the core order because every one of these is optional on
 * insert: a direct visit has no campaign parameters, and `invoice_slug` only
 * exists once InfinitePay tells us about it.
 */
export type CheckoutOrderAttribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbp: string | null;
  fbc: string | null;
  landing_path: string | null;
  invoice_slug: string | null;
};

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
} & CheckoutOrderAttribution;

/**
 * Ledger of conversion events sent to the ad platforms (migration 005).
 *
 * The unique index on (destination, event_id) is what makes reporting
 * exactly-once — see lib/tracking/conversions.ts.
 */
export type ConversionEventRow = {
  id: number;
  event_id: string;
  destination: "meta_capi" | "google_ads";
  event_name: string;
  order_nsu: string | null;
  amount_cents: number | null;
  status: "pending" | "sent" | "failed";
  attempts: number;
  detail: string | null;
  created_at: string;
  sent_at: string | null;
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
        Insert: Omit<
          CheckoutOrderRow,
          "created_at" | "status" | keyof CheckoutOrderAttribution
        > & {
          created_at?: string;
          status?: CheckoutOrderStatus;
        } & Partial<CheckoutOrderAttribution>;
        Update: Partial<CheckoutOrderRow>;
        Relationships: [];
      };
      conversion_events: {
        Row: ConversionEventRow;
        Insert: Omit<
          ConversionEventRow,
          "id" | "created_at" | "status" | "attempts" | "detail" | "sent_at"
        > & {
          id?: number;
          created_at?: string;
          status?: ConversionEventRow["status"];
          attempts?: number;
          detail?: string | null;
          sent_at?: string | null;
        };
        Update: Partial<ConversionEventRow>;
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
      events: {
        Row: EventRow;
        Insert: Omit<EventRow, "id" | "created_at"> & {
          id?: number;
          created_at?: string;
        };
        Update: Partial<EventRow>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingRow;
        Insert: Omit<AppSettingRow, "updated_at"> & { updated_at?: string };
        Update: Partial<AppSettingRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      purge_expired_codes: {
        Args: { grace_days?: number };
        Returns: number;
      };
      admin_overview: {
        /** Window for the "jogos mais vistos" list. 0 = today. */
        Args: { top_days?: number };
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
