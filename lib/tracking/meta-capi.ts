import type { Attribution } from "./attribution";

/**
 * Meta Conversions API — server-side Purchase reporting. SERVER ONLY.
 *
 * Why the server sends Purchase instead of the browser: the only place that
 * knows a payment really settled is our backend, after InfinitePay confirms
 * it. A browser-side Purchase fires whenever someone loads a URL, which makes
 * it trivially inflatable and unreliable when a pixel is blocked.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 * (content summarised here; rephrased for compliance with licensing
 * restrictions)
 *
 * HARD RULE: nothing in this file may throw. It is called from the InfinitePay
 * webhook, where an exception would turn into a 400, make InfinitePay retry,
 * and risk delaying the customer's access code. A marketing pixel must never
 * be able to hold up a delivery.
 */

/**
 * Graph API version. Meta expires a version roughly two years after release,
 * and an expired version fails the whole call — so this is overridable without
 * a code change.
 *
 * Confirm the current version in Events Manager if calls start failing with a
 * version error; the failure is recorded in `conversion_events.detail`.
 */
const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v26.0";

/**
 * Default ceiling on the call. Callers on a tight budget pass their own —
 * the InfinitePay webhook aims to answer in about a second, so it uses a much
 * shorter one rather than risking a retry over a pixel.
 */
const DEFAULT_TIMEOUT_MS = 2500;

export type CapiResult = {
  ok: boolean;
  /** Short, human-readable outcome for the event ledger. Never a token. */
  detail: string;
};

function pixelId(): string | null {
  return process.env.META_PIXEL_ID?.trim() || null;
}

function accessToken(): string | null {
  return process.env.META_CAPI_ACCESS_TOKEN?.trim() || null;
}

/**
 * Whether to forward the visitor's IP address to Meta.
 *
 * Defaults to OFF, deliberately. This app never stores a raw IP — see
 * `hashIp` in lib/analytics/events.ts — and shipping one to a third party
 * would quietly contradict that. Meta uses IP to improve match quality, so
 * turning it on raises measured conversions at a privacy cost that has to be
 * declared in the privacy policy first.
 *
 * Set META_CAPI_SEND_IP=true once that policy exists.
 */
function sendIpEnabled(): boolean {
  return process.env.META_CAPI_SEND_IP === "true";
}

export type PurchasePayload = {
  orderNsu: string;
  amountCents: number;
  /** Shared with the browser so Meta can collapse duplicates. */
  eventId: string;
  eventSourceUrl: string;
  /** Unix seconds. Defaults to now. */
  eventTime?: number;
  attribution?: Attribution | null;
  userAgent?: string | null;
  clientIp?: string | null;
  /** Override the request timeout. Used by the webhook to stay under budget. */
  timeoutMs?: number;
};

/**
 * Report a confirmed purchase.
 *
 * Returns a result instead of throwing, so the caller can record the outcome
 * and carry on regardless.
 */
export async function sendPurchase(
  payload: PurchasePayload,
): Promise<CapiResult> {
  const id = pixelId();
  const token = accessToken();

  // Not configured is a normal state, not an error: the app runs fine without
  // any ad platform attached.
  if (!id) return { ok: false, detail: "META_PIXEL_ID não configurado" };
  if (!token) {
    return { ok: false, detail: "META_CAPI_ACCESS_TOKEN não configurado" };
  }

  const attribution = payload.attribution ?? {};

  // user_data carries the identifiers Meta matches on. We have no email or
  // phone (the checkout deliberately doesn't ask for contact details, to keep
  // the funnel short), so matching leans entirely on the Pixel cookies.
  const userData: Record<string, unknown> = {};
  if (attribution.fbp) userData.fbp = attribution.fbp;
  if (attribution.fbc) userData.fbc = attribution.fbc;
  if (payload.userAgent) userData.client_user_agent = payload.userAgent;
  if (sendIpEnabled() && payload.clientIp) {
    userData.client_ip_address = payload.clientIp;
  }

  const event: Record<string, unknown> = {
    event_name: "Purchase",
    event_id: payload.eventId,
    event_time: payload.eventTime ?? Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: payload.eventSourceUrl,
    user_data: userData,
    custom_data: {
      value: Math.round(payload.amountCents) / 100,
      currency: "BRL",
      // Meta dedupes purchases by order id on top of event_id.
      order_id: payload.orderNsu,
      content_type: "product",
    },
  };

  const body: Record<string, unknown> = { data: [event] };

  // Routes the event to the Test Events tab instead of live reporting. Leave
  // unset in production or real conversions stop counting.
  const testCode = process.env.META_TEST_EVENT_CODE?.trim();
  if (testCode) body.test_event_code = testCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
    id,
  )}/events?access_token=${encodeURIComponent(token)}`;

  const timeoutMs = payload.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text();

    if (!res.ok) {
      // Meta's error bodies can embed the request, so keep the excerpt short
      // and never log the URL (it carries the token in the query string).
      const excerpt = text.slice(0, 300);
      console.error(
        `[capi] Purchase ${payload.orderNsu} rejeitado (${res.status}): ${excerpt}`,
      );
      return { ok: false, detail: `Meta ${res.status}: ${excerpt}` };
    }

    let received: unknown;
    try {
      received = (JSON.parse(text) as { events_received?: unknown })
        .events_received;
    } catch {
      /* accepted but unparseable — still a success */
    }

    console.log(
      `[capi] Purchase ${payload.orderNsu} aceito${
        typeof received === "number" ? ` (events_received=${received})` : ""
      }${testCode ? " [modo teste]" : ""}`,
    );
    return {
      ok: true,
      detail: testCode
        ? `aceito em modo teste (${testCode})`
        : `aceito${typeof received === "number" ? ` · ${received} evento(s)` : ""}`,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? `timeout após ${timeoutMs}ms`
          : err.message
        : String(err);
    console.error(`[capi] Purchase ${payload.orderNsu} falhou: ${message}`);
    return { ok: false, detail: message };
  }
}
