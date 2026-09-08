import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { serviceRoleClient } from "@/lib/supabase/server";

/**
 * Event log — the data behind /admin. SERVER ONLY.
 *
 * Design rules:
 *   - Logging must NEVER break the request it describes. Every call is
 *     wrapped and failures are swallowed with a console warning.
 *   - Never store a raw IP (LGPD) and never store a full access code that
 *     failed validation. Both are reduced before they touch the database.
 *   - The columns we filter and group by are real columns; anything else
 *     goes into `meta`.
 */

export type EventType =
  // Checkout funnel
  | "checkout_click" // the pay button was pressed
  | "checkout_created" // InfinitePay returned a payment link
  | "checkout_failed" // link creation failed
  | "payment_confirmed" // payment verified, code issued
  | "payment_unconfirmed" // callback arrived but payment not settled
  | "payment_underpaid" // settled amount below the order
  // Analyses
  | "analysis_view" // an analysis was served (free or paid)
  | "analysis_computed" // cache miss: real API + OpenAI cost
  | "analysis_blocked" // paywall shown
  // Session
  | "login_success"
  | "login_failed"
  | "logout"
  // Admin
  | "code_created"
  | "code_revoked";

export type EventInput = {
  type: EventType;
  code?: string | null;
  fixtureId?: number | null;
  orderNsu?: string | null;
  amountCents?: number | null;
  isFree?: boolean | null;
  ok?: boolean | null;
  detail?: string | null;
  meta?: Record<string, unknown> | null;
  /** Set false for webhook/server-to-server calls with no visitor context. */
  captureRequest?: boolean;
};

/**
 * Hash an IP so we can count distinct visitors without storing addresses.
 *
 * Salted with the service-role key: IPv4 has only ~4 billion values, so an
 * unsalted hash would be trivially reversible. The key never leaves the
 * server, and we keep 16 hex chars — enough to distinguish visitors, short
 * enough to be useless elsewhere.
 */
function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "apostai";
  return createHash("sha256").update(`${ip}|${salt}`).digest("hex").slice(0, 16);
}

/** Show enough of a bad code to recognise a typo, never enough to reuse it. */
export function maskCode(raw: string): string {
  const c = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) return "(vazio)";
  if (c.length <= 4) return `${c.slice(0, 1)}*** (${c.length} car.)`;
  return `${c.slice(0, 4)}**** (${c.length} car.)`;
}

function readRequestContext(): {
  path: string | null;
  ipHash: string | null;
  userAgent: string | null;
} {
  try {
    const h = headers();
    // x-forwarded-for is a list; the client is the first entry.
    const fwd = h.get("x-forwarded-for");
    const ip = fwd ? fwd.split(",")[0]!.trim() : h.get("x-real-ip");
    return {
      path: h.get("x-invoke-path") ?? h.get("referer") ?? null,
      ipHash: hashIp(ip),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    };
  } catch {
    // headers() throws outside a request scope.
    return { path: null, ipHash: null, userAgent: null };
  }
}

/**
 * Record one event. Fire-and-forget: callers don't need to await, and a
 * failure here never propagates.
 */
export async function logEvent(input: EventInput): Promise<void> {
  try {
    const ctx =
      input.captureRequest === false
        ? { path: null, ipHash: null, userAgent: null }
        : readRequestContext();

    await serviceRoleClient()
      .from("events")
      .insert({
        type: input.type,
        code: input.code ?? null,
        fixture_id: input.fixtureId ?? null,
        order_nsu: input.orderNsu ?? null,
        amount_cents: input.amountCents ?? null,
        is_free: input.isFree ?? null,
        ok: input.ok ?? null,
        detail: input.detail ?? null,
        path: ctx.path,
        ip_hash: ctx.ipHash,
        user_agent: ctx.userAgent,
        meta: (input.meta ?? null) as never,
      } as never);
  } catch (err) {
    console.warn(`[events] failed to log ${input.type}:`, err);
  }
}
