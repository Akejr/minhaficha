import { headers } from "next/headers";

/**
 * Absolute public base URL of this deployment. SERVER ONLY.
 *
 * Needed anywhere we hand a URL to something outside the app: InfinitePay's
 * redirect and webhook, and the `event_source_url` the Meta Conversions API
 * requires.
 *
 * Extracted from app/api/checkout/route.ts so the localhost guard below exists
 * in exactly one place — it was written after a real payment was lost, and a
 * second copy that drifts would lose another one.
 */

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

function isLocal(host: string): boolean {
  return LOCAL_HOST_RE.test(host);
}

/**
 * Decide the base URL from the incoming request and NEXT_PUBLIC_SITE_URL.
 *
 * Precedence:
 *   1. NEXT_PUBLIC_SITE_URL, when it is a valid URL and not localhost while
 *      we are serving a real host;
 *   2. the request's own host.
 *
 * That second rule is the important one. A production deployment still
 * carrying `http://localhost:8080` would send the customer back to their own
 * machine and point InfinitePay's webhook at nothing: the payment succeeds and
 * no access code is ever issued. That happened. So a localhost value is
 * ignored — loudly — whenever the request came from somewhere real.
 */
export function resolveBaseUrl(
  requestHost: string | null,
  forwardedProto: string | null,
): string {
  const host = requestHost ?? "";
  const fromRequest = () =>
    `${forwardedProto ?? "https"}://${host || "localhost:8080"}`;

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return fromRequest();

  let configuredHost = "";
  try {
    configuredHost = new URL(configured).host;
  } catch {
    console.warn(`[site-url] NEXT_PUBLIC_SITE_URL inválida: ${configured}`);
    return fromRequest();
  }

  if (isLocal(configuredHost) && !isLocal(host)) {
    console.error(
      `[site-url] NEXT_PUBLIC_SITE_URL aponta para "${configuredHost}" mas a requisição veio de "${host}". ` +
        `Usando o host da requisição. CORRIJA a variável de ambiente.`,
    );
    return fromRequest();
  }

  return configured.replace(/\/$/, "");
}

/** For route handlers, which have the request in hand. */
export function baseUrlFromRequest(req: {
  headers: { get(name: string): string | null };
}): string {
  return resolveBaseUrl(
    req.headers.get("host"),
    req.headers.get("x-forwarded-proto"),
  );
}

/**
 * For server components and anything else inside a request scope but without
 * the request object. Falls back to NEXT_PUBLIC_SITE_URL when called outside
 * one (`headers()` throws there).
 */
export function baseUrlFromHeaders(): string {
  try {
    const h = headers();
    return resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
  } catch {
    return (
      process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ??
      "https://apostai.live"
    );
  }
}
