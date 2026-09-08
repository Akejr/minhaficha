import { randomInt, timingSafeEqual } from "node:crypto";
import { serviceRoleClient } from "@/lib/supabase/server";
import type { AccessCodeRow } from "@/lib/supabase/types";
import { CODE_LENGTH, formatCode, normalizeCode } from "./format";

/**
 * Access codes — the app's only credential. SERVER ONLY.
 *
 * This module imports `node:crypto` and the service-role database client, so
 * it must never be pulled into a client component. UI code wants
 * lib/access/format.ts instead (normalizeCode / formatCode / CODE_LENGTH).
 *
 * A customer pays through the InfinitePay checkout and receives a
 * 12-character code valid for 30 days. That code is what they type to log
 * in; there are no emails, passwords or accounts.
 *
 * Design notes:
 *   - 12 chars from a 32-symbol alphabet ≈ 60 bits of entropy (32^12 ≈
 *     1.2e18). Guessing one is not feasible, so we don't need lockouts.
 *   - Ambiguous glyphs (0/O, 1/I/L, U/V) are excluded so a code can be
 *     read aloud or copied off a screenshot without mistakes.
 *   - Everything is stored and compared uppercase.
 */

/** Uppercase, no 0/O/1/I/L/U to avoid transcription errors. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";

export const CODE_VALIDITY_DAYS = 30;

// Re-exported so server-side callers have a single import site.
export { CODE_LENGTH, formatCode, normalizeCode };

/** What a code grants. Checkout always issues `monthly`. */
export type CodeKind = "monthly" | "annual" | "lifetime";

export const CODE_KINDS: Record<
  CodeKind,
  { label: string; days: number | null }
> = {
  monthly: { label: "Mensal (30 dias)", days: 30 },
  annual: { label: "Anual (365 dias)", days: 365 },
  lifetime: { label: "Vitalício (não expira)", days: null },
};

export function isCodeKind(v: unknown): v is CodeKind {
  return v === "monthly" || v === "annual" || v === "lifetime";
}

/**
 * The owner's permanent code, read from the environment.
 *
 * Deliberately NOT defaulted to a literal: this repository is public, and a
 * hardcoded fallback would hand permanent free access to anyone who reads the
 * source. Returns null when unset, in which case there is simply no master
 * code and only database-backed codes work.
 */
export function masterCode(): string | null {
  const raw = process.env.MASTER_ACCESS_CODE;
  if (!raw) return null;
  return normalizeCode(raw) || null;
}

/** Constant-time string compare, safe against length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function isMasterCode(raw: string): boolean {
  const master = masterCode();
  if (!master) return false;
  return safeEqual(normalizeCode(raw), master);
}

/**
 * Generate a fresh 12-character code using a CSPRNG.
 * `randomInt` is rejection-sampled internally, so there's no modulo bias.
 */
export function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

export type AccessInfo = {
  code: string;
  isPermanent: boolean;
  /** null when permanent. */
  expiresAt: Date | null;
  /** Whole days left; Infinity for permanent codes. */
  daysLeft: number;
};

function toAccessInfo(row: AccessCodeRow): AccessInfo {
  if (row.is_permanent || !row.expires_at) {
    return {
      code: row.code,
      isPermanent: true,
      expiresAt: null,
      daysLeft: Number.POSITIVE_INFINITY,
    };
  }
  const expiresAt = new Date(row.expires_at);
  const msLeft = expiresAt.getTime() - Date.now();
  return {
    code: row.code,
    isPermanent: false,
    expiresAt,
    daysLeft: Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000))),
  };
}

/** The synthetic record we return for the master code. */
function masterAccessInfo(code: string): AccessInfo {
  return {
    code,
    isPermanent: true,
    expiresAt: null,
    daysLeft: Number.POSITIVE_INFINITY,
  };
}

/**
 * Resolve a raw code into access info, or null when it's invalid/expired.
 *
 * The master code short-circuits: it is always valid, even if the database
 * row is missing or someone deleted it.
 */
export async function validateCode(raw: string): Promise<AccessInfo | null> {
  const code = normalizeCode(raw);
  if (!code) return null;

  const master = masterCode();
  if (master && safeEqual(code, master)) return masterAccessInfo(master);

  // Cheap sanity bounds before touching the database. We don't require
  // exactly CODE_LENGTH here: manually issued codes (including a permanent
  // owner code seeded straight into access_codes) may be any length, and
  // that row is what keeps things working if MASTER_ACCESS_CODE is unset.
  if (code.length < 4 || code.length > 64) return null;

  try {
    const sb = serviceRoleClient();
    const { data } = await sb
      .from("access_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!data) return null;
    const row = data as AccessCodeRow;

    // Revoked beats everything, including permanent codes.
    if (row.revoked_at) return null;

    if (!row.is_permanent) {
      if (!row.expires_at) return null;
      if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    }
    return toAccessInfo(row);
  } catch (err) {
    console.error("[access] validateCode failed:", err);
    return null;
  }
}

/** Best-effort "last seen" stamp. Never throws, never blocks the request. */
export async function touchCode(code: string): Promise<void> {
  const normalized = normalizeCode(code);
  if (!normalized || isMasterCode(normalized)) return;
  try {
    await serviceRoleClient()
      .from("access_codes")
      .update({ last_used_at: new Date().toISOString() })
      .eq("code", normalized);
  } catch {
    /* non-critical */
  }
}

/**
 * Create a code for a paid order, valid for CODE_VALIDITY_DAYS.
 *
 * Idempotent per order: if this order already produced a code we return
 * the existing one instead of issuing a second. That matters because the
 * webhook and the success page can both call this, in either order.
 */
export async function issueCodeForOrder(args: {
  orderNsu: string;
  transactionNsu?: string | null;
  amountCents?: number | null;
}): Promise<string> {
  const sb = serviceRoleClient();

  const { data: existing } = await sb
    .from("access_codes")
    .select("code")
    .eq("order_nsu", args.orderNsu)
    .maybeSingle();
  if (existing?.code) return existing.code;

  const expiresAt = new Date(
    Date.now() + CODE_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Retry on the (astronomically unlikely) primary-key collision.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await sb.from("access_codes").insert({
      code,
      expires_at: expiresAt,
      is_permanent: false,
      // Checkout only ever sells the 30-day plan.
      kind: "monthly",
      source: "checkout",
      order_nsu: args.orderNsu,
      transaction_nsu: args.transactionNsu ?? null,
      amount_cents: args.amountCents ?? null,
      note: null,
      last_used_at: null,
      revoked_at: null,
    });
    if (!error) return code;

    lastError = error;
    // A duplicate order_nsu means a concurrent call won the race — reuse it.
    const { data: raced } = await sb
      .from("access_codes")
      .select("code")
      .eq("order_nsu", args.orderNsu)
      .maybeSingle();
    if (raced?.code) return raced.code;
  }

  throw new Error(
    `Não foi possível gerar o código de acesso: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/**
 * Mint a code by hand from the admin panel.
 *
 * Unlike `issueCodeForOrder` there is no order to be idempotent against, so
 * every call produces a new code. `lifetime` stores expires_at = NULL with
 * is_permanent = true; the others get a deadline.
 */
export async function createAdminCode(args: {
  kind: CodeKind;
  note?: string | null;
}): Promise<{ code: string; expiresAt: string | null }> {
  const sb = serviceRoleClient();
  const spec = CODE_KINDS[args.kind];
  const expiresAt =
    spec.days === null
      ? null
      : new Date(Date.now() + spec.days * 24 * 60 * 60 * 1000).toISOString();

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await sb.from("access_codes").insert({
      code,
      expires_at: expiresAt,
      is_permanent: args.kind === "lifetime",
      kind: args.kind,
      source: "admin",
      order_nsu: null,
      transaction_nsu: null,
      amount_cents: null,
      note: args.note?.trim() || null,
      last_used_at: null,
      revoked_at: null,
    });
    if (!error) return { code, expiresAt };
    lastError = error;
  }

  throw new Error(
    `Não foi possível criar o código: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/** Revoke a code without deleting it, so its history stays attached. */
export async function revokeCode(raw: string): Promise<boolean> {
  const code = normalizeCode(raw);
  if (!code) return false;
  const { error } = await serviceRoleClient()
    .from("access_codes")
    .update({ revoked_at: new Date().toISOString() })
    .eq("code", code);
  return !error;
}
