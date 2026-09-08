import { serviceRoleClient } from "@/lib/supabase/server";
import type {
  AccessCodeRow,
  CheckoutOrderRow,
  EventRow,
} from "@/lib/supabase/types";

/**
 * Read side of the admin panel. SERVER ONLY.
 *
 * The headline numbers come from a single `admin_overview()` RPC so Postgres
 * does the aggregation in one round trip instead of ~25 PostgREST calls. The
 * lists (codes, orders, events) are plain selects with hard limits.
 */

export type AdminOverview = {
  generatedAt: string;
  analyses: {
    total: number;
    day: number;
    week: number;
    month: number;
    freeTotal: number;
    freeDay: number;
    freeWeek: number;
    paidTotal: number;
    paidDay: number;
    paidWeek: number;
    computedTotal: number;
    computedDay: number;
    computedWeek: number;
    blockedTotal: number;
    blockedWeek: number;
  };
  funnel: {
    clicksTotal: number;
    clicksWeek: number;
    createdTotal: number;
    createdWeek: number;
    failedTotal: number;
    failedWeek: number;
    paidTotal: number;
    paidWeek: number;
    rejectedTotal: number;
  };
  revenue: {
    centsTotal: number;
    centsWeek: number;
    centsMonth: number;
    ordersPaid: number;
    ordersPending: number;
  };
  codes: {
    total: number;
    active: number;
    expired: number;
    revoked: number;
    monthly: number;
    annual: number;
    lifetime: number;
    fromAdmin: number;
    fromCheckout: number;
  };
  logins: { okWeek: number; failedWeek: number };
  daily: { day: string; analyses: number; clicks: number; payments: number }[];
  topFixtures: { fixtureId: number; views: number }[];
};

/** Zeroed overview, used when the RPC is missing (migration not applied yet). */
const EMPTY: AdminOverview = {
  generatedAt: new Date().toISOString(),
  analyses: {
    total: 0, day: 0, week: 0, month: 0,
    freeTotal: 0, freeDay: 0, freeWeek: 0,
    paidTotal: 0, paidDay: 0, paidWeek: 0,
    computedTotal: 0, computedDay: 0, computedWeek: 0,
    blockedTotal: 0, blockedWeek: 0,
  },
  funnel: {
    clicksTotal: 0, clicksWeek: 0, createdTotal: 0, createdWeek: 0,
    failedTotal: 0, failedWeek: 0, paidTotal: 0, paidWeek: 0, rejectedTotal: 0,
  },
  revenue: { centsTotal: 0, centsWeek: 0, centsMonth: 0, ordersPaid: 0, ordersPending: 0 },
  codes: {
    total: 0, active: 0, expired: 0, revoked: 0,
    monthly: 0, annual: 0, lifetime: 0, fromAdmin: 0, fromCheckout: 0,
  },
  logins: { okWeek: 0, failedWeek: 0 },
  daily: [],
  topFixtures: [],
};

export type AdminData = {
  overview: AdminOverview;
  codes: AccessCodeRow[];
  orders: CheckoutOrderRow[];
  events: EventRow[];
  /** Set when the migration hasn't been applied yet. */
  setupError: string | null;
};

export async function loadAdminData(eventLimit = 120): Promise<AdminData> {
  const sb = serviceRoleClient();
  let setupError: string | null = null;

  const [overviewRes, codesRes, ordersRes, eventsRes] = await Promise.all([
    sb.rpc("admin_overview"),
    sb
      .from("access_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from("checkout_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60),
    sb
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(eventLimit),
  ]);

  if (overviewRes.error) {
    setupError =
      "Não consegui ler os indicadores. Rode supabase/migration-002-admin-events.sql no editor SQL do Supabase.";
    console.error("[admin] admin_overview failed:", overviewRes.error);
  }

  return {
    overview: (overviewRes.data as AdminOverview | null) ?? EMPTY,
    codes: (codesRes.data ?? []) as AccessCodeRow[],
    orders: (ordersRes.data ?? []) as CheckoutOrderRow[],
    events: (eventsRes.data ?? []) as EventRow[],
    setupError,
  };
}

/** Safe percentage for funnel steps. */
export function rate(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** How many analyses this code has opened, for the codes table. */
export async function analysesPerCode(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const { data } = await serviceRoleClient()
      .from("events")
      .select("code")
      .eq("type", "analysis_view")
      .not("code", "is", null)
      .limit(5000);
    for (const row of (data ?? []) as { code: string | null }[]) {
      if (!row.code) continue;
      out.set(row.code, (out.get(row.code) ?? 0) + 1);
    }
  } catch (err) {
    console.warn("[admin] analysesPerCode failed:", err);
  }
  return out;
}
