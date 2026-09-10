/**
 * Browser-side conversion tracking. THE single entry point.
 *
 * Every ad-platform event in the app goes through `track()`. Nothing else may
 * call `fbq` or `gtag` directly — that rule is what keeps a given event from
 * being reported twice by two different components.
 *
 * Three guarantees:
 *   1. Never throws. A blocked pixel, an ad blocker or a missing env var
 *      degrades to a no-op; it must never break the page the visitor is on.
 *   2. Deduplicated. Each event declares how long it stays fired (this page
 *      load / this session / forever) and re-firing is dropped.
 *   3. Explicit about standard vs custom Meta events, because Meta treats
 *      them differently and sending a custom event as standard silently
 *      discards it.
 */

import {
  ATTRIBUTION_QUERY_KEYS,
  fbcFromFbclid,
  sanitizeAttribution,
  type Attribution,
} from "./attribution";

type FbqFn = (
  command: "init" | "track" | "trackCustom" | "consent",
  ...rest: unknown[]
) => void;
type GtagFn = (
  command: "js" | "config" | "event" | "set",
  ...rest: unknown[]
) => void;

declare global {
  interface Window {
    fbq?: FbqFn & { queue?: unknown[]; loaded?: boolean };
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

/* -------------------------------------------------------------------------
 * Storage helpers — every one of them fails soft.
 *
 * Private browsing, disabled storage and quota errors all throw on access.
 * Tracking is not important enough to break a page over, so each helper
 * swallows and returns a neutral value.
 * ---------------------------------------------------------------------- */

const KEY_PREFIX = "apostai:";
const ATTRIBUTION_KEY = `${KEY_PREFIX}attribution`;
/** Internal field inside the stored blob; never a database column. */
const CAPTURED_AT_KEY = "_capturedAt";

function safeGet(store: "local" | "session", key: string): string | null {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    return s.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: "local" | "session", key: string, value: string) {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    s.setItem(key, value);
  } catch {
    /* storage unavailable — dedup degrades to per-page-load only */
  }
}

/** Read a browser cookie by name. Returns null when absent. */
function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
    );
    return match ? decodeURIComponent(match[1]!) : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Attribution capture
 * ---------------------------------------------------------------------- */

/**
 * Record the campaign parameters from the current URL, once.
 *
 * First-touch: if we already stored attribution for this browser we keep it.
 * The stored copy also remembers the landing path, which tells us whether the
 * campaign sent people to `/start` or straight to the home page.
 *
 * Safe to call on every page load; it exits early after the first one.
 */
export function captureAttribution(): void {
  try {
    if (safeGet("local", ATTRIBUTION_KEY)) return;

    const params = new URLSearchParams(window.location.search);
    const found: Record<string, string> = {};
    for (const key of ATTRIBUTION_QUERY_KEYS) {
      const value = params.get(key);
      if (value) found[key] = value;
    }

    // Nothing to attribute: a direct visit. Don't write a row of nulls,
    // because that would lock out a real ad click arriving later in the
    // same browser.
    if (Object.keys(found).length === 0) return;

    found.landing_path = window.location.pathname;
    // When the click happened. Needed to rebuild `_fbc` later with the right
    // timestamp — Meta encodes the moment the fbclid was seen, so stamping it
    // at read time would produce a value that no longer matches the click.
    // Not an attribution field, so `sanitizeAttribution` drops it before it
    // can reach the database.
    found[CAPTURED_AT_KEY] = String(Date.now());
    safeSet("local", ATTRIBUTION_KEY, JSON.stringify(found));
  } catch {
    /* never break a page over analytics */
  }
}

/**
 * Everything we know about where this visitor came from.
 *
 * Merges the stored first-touch parameters with the Meta cookies, which are
 * read live because the Pixel writes them after our capture runs. When the
 * Pixel never got to set `_fbc` but we did store an `fbclid`, we rebuild the
 * cookie value ourselves rather than lose the click.
 */
export function readAttribution(): Attribution {
  try {
    const stored = safeGet("local", ATTRIBUTION_KEY);
    const base = stored
      ? (JSON.parse(stored) as Record<string, unknown>)
      : ({} as Record<string, unknown>);

    const fbp = readCookie("_fbp");
    if (fbp) base.fbp = fbp;

    const fbc = readCookie("_fbc");
    if (fbc) {
      // The Pixel's own value always wins: it is what the browser sent to Meta.
      base.fbc = fbc;
    } else if (typeof base.fbclid === "string" && base.fbclid) {
      // Pixel blocked or loaded too late. Rebuild from the click we recorded,
      // using the timestamp from when we actually saw it.
      const capturedAt = Number(base[CAPTURED_AT_KEY]);
      base.fbc = fbcFromFbclid(
        base.fbclid,
        Number.isFinite(capturedAt) ? capturedAt : Date.now(),
      );
    }

    return sanitizeAttribution(base);
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------------------
 * Events
 * ---------------------------------------------------------------------- */

/**
 * How long a fired event stays fired.
 *
 *   "load"    — this page load only (a remount must not re-fire)
 *   "session" — until the tab is closed
 *   "forever" — permanently, per dedup key; survives refresh and reopening
 */
type DedupScope = "load" | "session" | "forever";

export type TrackedEvent =
  | { name: "FreeAnalysisViewed"; fixtureId: number }
  | { name: "SubscriptionOfferViewed"; surface: string }
  | { name: "InitiateCheckout"; orderNsu: string; valueCents: number }
  | {
      name: "Purchase";
      orderNsu: string;
      valueCents: number;
      /** "AW-123456789/AbCdEfGh" — required, or the conversion is skipped. */
      googleSendTo: string;
    };

/**
 * Meta's standard event catalogue. Anything outside it must be sent with
 * `trackCustom`: passing a custom name to `track` is accepted by the browser
 * and then dropped server-side, which looks like working code that reports
 * nothing.
 *
 * `FreeAnalysisViewed` and `SubscriptionOfferViewed` are intentionally custom
 * — they describe this product, not a generic funnel. They need a Custom
 * Conversion in Events Manager before a campaign can optimise for them.
 */
const META_STANDARD_EVENTS = new Set(["InitiateCheckout", "Purchase"]);

/** Fired-event memory for the current page load. */
const firedThisLoad = new Set<string>();

function alreadyFired(key: string, scope: DedupScope): boolean {
  if (firedThisLoad.has(key)) return true;
  if (scope === "session") return safeGet("session", key) !== null;
  if (scope === "forever") return safeGet("local", key) !== null;
  return false;
}

function markFired(key: string, scope: DedupScope): void {
  firedThisLoad.add(key);
  const stamp = String(Date.now());
  if (scope === "session") safeSet("session", key, stamp);
  if (scope === "forever") safeSet("local", key, stamp);
}

/** Cents → the decimal number the ad platforms expect (1500 → 15). */
function toCurrency(cents: number): number {
  return Math.round(cents) / 100;
}

type Plan = {
  dedupKey: string;
  scope: DedupScope;
  /** Parameters for Meta. */
  meta: Record<string, unknown>;
  /** Event name + parameters for Google. null skips Google entirely. */
  google: { name: string; params: Record<string, unknown> } | null;
  /** Shared with the Conversions API so Meta can dedupe browser vs server. */
  eventId?: string;
};

/**
 * Translate an app event into per-platform payloads.
 *
 * Kept separate from delivery so the dedup key and the scope are decided in
 * one readable place.
 */
function plan(event: TrackedEvent): Plan {
  switch (event.name) {
    case "FreeAnalysisViewed":
      return {
        // Per fixture: opening two different free analyses is two events,
        // re-rendering the same one is not.
        dedupKey: `${KEY_PREFIX}ev:free:${event.fixtureId}`,
        scope: "session",
        meta: { content_type: "fixture", content_ids: [String(event.fixtureId)] },
        google: {
          name: "free_analysis_viewed",
          params: { fixture_id: event.fixtureId },
        },
      };

    case "SubscriptionOfferViewed":
      return {
        // Once per session across every surface. The offer appears in the
        // promo strip, the profile screen, the upsell card and the modal;
        // counting each one would inflate the step and make the funnel
        // ratio meaningless.
        dedupKey: `${KEY_PREFIX}ev:offer`,
        scope: "session",
        meta: { surface: event.surface },
        google: {
          name: "subscription_offer_viewed",
          params: { surface: event.surface },
        },
      };

    case "InitiateCheckout":
      return {
        // Per order: a second genuine attempt mints a new order_nsu and is a
        // real second InitiateCheckout.
        dedupKey: `${KEY_PREFIX}ev:ic:${event.orderNsu}`,
        scope: "forever",
        eventId: `checkout_${event.orderNsu}`,
        meta: {
          value: toCurrency(event.valueCents),
          currency: "BRL",
          content_type: "product",
          num_items: 1,
        },
        google: {
          name: "begin_checkout",
          params: {
            value: toCurrency(event.valueCents),
            currency: "BRL",
            transaction_id: event.orderNsu,
          },
        },
      };

    case "Purchase":
      return {
        // "forever" is the requirement here: the success page is refreshable
        // and bookmarkable, so a session-scoped guard would report the same
        // sale again tomorrow.
        dedupKey: `${KEY_PREFIX}ev:purchase:${event.orderNsu}`,
        scope: "forever",
        eventId: `purchase_${event.orderNsu}`,
        // Meta's Purchase is sent server-side by the Conversions API, where
        // it is backed by a confirmed payment. Sending it from the browser
        // too would double-count unless both sides agree on event_id, and
        // the browser can be reloaded by anyone.
        meta: {},
        google: {
          name: "conversion",
          params: {
            send_to: event.googleSendTo,
            value: toCurrency(event.valueCents),
            currency: "BRL",
            transaction_id: event.orderNsu,
          },
        },
      };
  }
}

/** Meta gets everything except Purchase, which is server-side only. */
function shouldSendToMeta(event: TrackedEvent): boolean {
  return event.name !== "Purchase";
}

/**
 * Report one event to the ad platforms.
 *
 * Returns true when it was delivered, false when it was deduplicated or no
 * platform was available. The return value is for logging and tests — callers
 * are not expected to branch on it.
 */
export function track(event: TrackedEvent): boolean {
  try {
    if (typeof window === "undefined") return false;

    const p = plan(event);
    if (alreadyFired(p.dedupKey, p.scope)) return false;

    let delivered = false;

    if (shouldSendToMeta(event) && typeof window.fbq === "function") {
      const command = META_STANDARD_EVENTS.has(event.name)
        ? "track"
        : "trackCustom";
      // eventID lets the Conversions API collapse a browser event and a
      // server event describing the same action into one.
      const options = p.eventId ? { eventID: p.eventId } : undefined;
      window.fbq(command, event.name, p.meta, options);
      delivered = true;
    }

    if (p.google && typeof window.gtag === "function") {
      window.gtag("event", p.google.name, p.google.params);
      delivered = true;
    }

    // Mark even when nothing was delivered: if the pixel is blocked, retrying
    // on every render just burns cycles. The dedup key is per page load in
    // that case anyway.
    markFired(p.dedupKey, p.scope);

    if (process.env.NODE_ENV !== "production") {
      console.debug(
        `[track] ${event.name}`,
        delivered ? "enviado" : "sem destino configurado",
        p.meta,
      );
    }
    return delivered;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[track] falhou:", err);
    }
    return false;
  }
}
