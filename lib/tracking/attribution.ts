/**
 * Ad attribution: which campaign brought this visitor here.
 *
 * Shared by the browser (capture) and the server (validation before insert),
 * so this module must stay free of both `next/headers` and `window`.
 *
 * Model: FIRST-touch. The first campaign that delivered the visitor gets the
 * credit and is never overwritten, because that is the click the platform
 * actually charged for. A visitor who arrives from an ad, leaves, and returns
 * directly still counts for the original ad.
 */

/** Query-string keys we read from the landing URL. */
export const ATTRIBUTION_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  // Google's cookieless replacements for gclid. Different keys, same job.
  "gbraid",
  "wbraid",
] as const;

/** Cookie-derived keys, set by the Meta Pixel rather than the URL. */
export const ATTRIBUTION_COOKIE_KEYS = ["fbp", "fbc"] as const;

export type AttributionField =
  | (typeof ATTRIBUTION_QUERY_KEYS)[number]
  | (typeof ATTRIBUTION_COOKIE_KEYS)[number]
  | "landing_path";

export type Attribution = Partial<Record<AttributionField, string>>;

const ALL_FIELDS: readonly AttributionField[] = [
  ...ATTRIBUTION_QUERY_KEYS,
  ...ATTRIBUTION_COOKIE_KEYS,
  "landing_path",
];

/**
 * Longest value we keep. Real utm values are short; anything approaching this
 * is either broken tooling or someone probing us. Truncating (rather than
 * rejecting) keeps a usable report without letting a caller write arbitrarily
 * large rows.
 */
const MAX_VALUE_LENGTH = 200;

/**
 * Strip a single value down to something safe to store.
 *
 * These strings arrive from the query string, which means they are fully
 * attacker-controlled. They are only ever displayed in /admin and forwarded
 * to the ad platforms — never used in a security decision — but we still
 * remove control characters so a crafted value cannot corrupt a log line or
 * smuggle markup into the dashboard.
 */
function cleanValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!stripped) return undefined;
  return stripped.slice(0, MAX_VALUE_LENGTH);
}

/**
 * Keep only known fields with usable values. Anything unexpected in the input
 * is dropped rather than passed through to the database.
 */
export function sanitizeAttribution(input: unknown): Attribution {
  if (!input || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const out: Attribution = {};
  for (const field of ALL_FIELDS) {
    const value = cleanValue(src[field]);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

/** True when there is at least one field worth storing. */
export function hasAttribution(a: Attribution): boolean {
  return Object.keys(a).length > 0;
}

/**
 * Map onto `checkout_orders` columns. The column names match the field names
 * one-to-one today, but going through an explicit map means renaming a column
 * can't silently start writing nulls.
 */
export function attributionToOrderColumns(
  a: Attribution,
): Record<string, string | null> {
  return {
    utm_source: a.utm_source ?? null,
    utm_medium: a.utm_medium ?? null,
    utm_campaign: a.utm_campaign ?? null,
    utm_content: a.utm_content ?? null,
    utm_term: a.utm_term ?? null,
    fbclid: a.fbclid ?? null,
    gclid: a.gclid ?? null,
    gbraid: a.gbraid ?? null,
    wbraid: a.wbraid ?? null,
    fbp: a.fbp ?? null,
    fbc: a.fbc ?? null,
    landing_path: a.landing_path ?? null,
  };
}

/**
 * Build the `_fbc` value Meta expects from a raw fbclid.
 *
 * Format: fb.<subdomain-index>.<timestamp-ms>.<fbclid>. The Pixel writes this
 * cookie itself, but it only does so on the page where fbclid appeared — if
 * the Pixel loads late, or is blocked, the cookie is missing while the
 * fbclid is right there in the URL we stored. Reconstructing it recovers
 * attribution that would otherwise be lost.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
 * (rephrased for compliance with licensing restrictions)
 */
export function fbcFromFbclid(
  fbclid: string,
  createdAtMs: number = Date.now(),
): string {
  return `fb.1.${createdAtMs}.${fbclid}`;
}
