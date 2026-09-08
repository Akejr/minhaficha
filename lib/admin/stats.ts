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
  topDays: number;
  topFixtures: TopFixture[];
};

export type TopFixture = {
  fixtureId: number;
  views: number;
  freeViews: number;
  /** null when the fixture is no longer in the analysis cache. */
  home: string | null;
  away: string | null;
  league: string | null;
  kickoffAt: string | null;
};

/** Windows offered by the "jogos mais vistos" selector. */
export const TOP_PERIODS = [
  { id: "hoje", label: "Hoje", days: 0 },
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "Mês", days: 30 },
] as const;

export type TopPeriodId = (typeof TOP_PERIODS)[number]["id"];

export function topPeriodDays(id: string | undefined): number {
  return TOP_PERIODS.find((p) => p.id === id)?.days ?? 0;
}

export function isTopPeriod(id: string | undefined): id is TopPeriodId {
  return TOP_PERIODS.some((p) => p.id === id);
}

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
  topDays: 0,
  topFixtures: [],
};

export type AdminData = {
  overview: AdminOverview;
  codes: AccessCodeRow[];
  orders: CheckoutOrderRow[];
  /** Already resolved to team names, for the preview at the top of /admin. */
  events: AdminEvent[];
  /** Set when the migration hasn't been applied yet. */
  setupError: string | null;
};

export async function loadAdminData(
  opts: { eventLimit?: number; topDays?: number } = {},
): Promise<AdminData> {
  const eventLimit = opts.eventLimit ?? 25;
  const sb = serviceRoleClient();
  let setupError: string | null = null;

  const [overviewRes, codesRes, ordersRes, events] = await Promise.all([
    sb.rpc("admin_overview", { top_days: opts.topDays ?? 0 }),
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
    loadEvents({ limit: eventLimit }),
  ]);

  if (overviewRes.error) {
    setupError =
      "Não consegui ler os indicadores. Rode supabase/migration-002-admin-events.sql e depois migration-003-admin-top-fixtures.sql no editor SQL do Supabase.";
    console.error("[admin] admin_overview failed:", overviewRes.error);
  }

  return {
    overview: (overviewRes.data as AdminOverview | null) ?? EMPTY,
    codes: (codesRes.data ?? []) as AccessCodeRow[],
    orders: (ordersRes.data ?? []) as CheckoutOrderRow[],
    events,
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

/** Event shaped for the UI, with the fixture resolved to team names. */
export type AdminEvent = {
  id: number;
  createdAt: string;
  type: string;
  code: string | null;
  fixtureId: number | null;
  fixtureLabel: string | null;
  orderNsu: string | null;
  amountCents: number | null;
  isFree: boolean | null;
  ok: boolean | null;
  detail: string | null;
  ipHash: string | null;
};

/**
 * Resolve fixture ids to "Home × Away" using the cached analysis payload.
 *
 * Free: the names already live in match_analyses.payload, so there is no
 * API-Football call. Fixtures that fell out of the cache come back missing
 * and the UI falls back to the numeric id.
 */
export async function fixtureLabels(
  ids: number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (unique.length === 0) return out;

  try {
    const { data } = await serviceRoleClient()
      .from("match_analyses")
      .select("fixture_id, payload")
      .in("fixture_id", unique);

    for (const row of (data ?? []) as {
      fixture_id: number;
      payload: unknown;
    }[]) {
      const p = row.payload as
        | { teams?: { home?: { name?: string }; away?: { name?: string } } }
        | null;
      const home = p?.teams?.home?.name;
      const away = p?.teams?.away?.name;
      if (home && away) out.set(row.fixture_id, `${home} × ${away}`);
    }
  } catch (err) {
    console.warn("[admin] fixtureLabels failed:", err);
  }
  return out;
}

/**
 * Page of events for the live feed.
 *
 * Cursor-based on the primary key rather than offset-based: `afterId` pulls
 * newer rows (what the poller asks for) and `beforeId` pulls older ones (the
 * "load more" button). Both are stable while rows are being inserted, which
 * offsets are not.
 */
export async function loadEvents(opts: {
  types?: string[];
  afterId?: number;
  beforeId?: number;
  limit?: number;
}): Promise<AdminEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
  const sb = serviceRoleClient();

  let q = sb.from("events").select("*");
  if (opts.types && opts.types.length > 0) q = q.in("type", opts.types);
  if (opts.afterId) q = q.gt("id", opts.afterId);
  if (opts.beforeId) q = q.lt("id", opts.beforeId);

  const { data, error } = await q
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin] loadEvents failed:", error);
    return [];
  }

  const rows = (data ?? []) as EventRow[];
  const labels = await fixtureLabels(
    rows.map((r) => r.fixture_id).filter((n): n is number => n != null),
  );

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    type: r.type,
    code: r.code,
    fixtureId: r.fixture_id,
    fixtureLabel: r.fixture_id ? labels.get(r.fixture_id) ?? null : null,
    orderNsu: r.order_nsu,
    amountCents: r.amount_cents,
    isFree: r.is_free,
    ok: r.ok,
    detail: r.detail,
    ipHash: r.ip_hash,
  }));
}
