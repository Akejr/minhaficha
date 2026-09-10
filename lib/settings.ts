import { serviceRoleClient } from "@/lib/supabase/server";
import { PLAN_PRICE_CENTS } from "@/lib/plans";

/**
 * Runtime settings, editable from /admin without a redeploy. SERVER ONLY.
 *
 * Currently just the first-month promo. It lives in the database rather than
 * an environment variable so the owner can flip it during a campaign.
 */

export const PROMO_KEY = "promo_first_month";

export type PromoSettings = {
  enabled: boolean;
  /** What the checkout charges while the promo is on. */
  priceCents: number;
};

/**
 * The intended marketing default: promo ON at R$ 15, against the R$ 50
 * standard price. `getPromo` still falls back to this if the settings row is
 * missing, so the discount is shown even before migration-004 runs.
 */
const DEFAULT_PROMO: PromoSettings = { enabled: true, priceCents: 1500 };

function coerce(value: unknown): PromoSettings {
  if (!value || typeof value !== "object") return DEFAULT_PROMO;
  const v = value as Record<string, unknown>;
  const priceCents =
    typeof v.priceCents === "number" && v.priceCents > 0
      ? Math.round(v.priceCents)
      : DEFAULT_PROMO.priceCents;
  return {
    enabled: v.enabled === true,
    // A "promo" that costs more than the normal price makes no sense and
    // would mislead, so clamp it to at most the standard price.
    priceCents: Math.min(priceCents, PLAN_PRICE_CENTS),
  };
}

/**
 * Read the promo. Fails CLOSED: any error (including the migration not being
 * applied yet) yields `enabled: false`, so we never advertise a discount we
 * can't honour.
 */
export async function getPromo(): Promise<PromoSettings> {
  try {
    const { data, error } = await serviceRoleClient()
      .from("app_settings")
      .select("value")
      .eq("key", PROMO_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_PROMO;
    return coerce((data as { value: unknown }).value);
  } catch (err) {
    console.warn("[settings] getPromo failed:", err);
    return DEFAULT_PROMO;
  }
}

export async function setPromo(next: PromoSettings): Promise<void> {
  const value = coerce(next);
  const { error } = await serviceRoleClient()
    .from("app_settings")
    .upsert({
      key: PROMO_KEY,
      value: value as never,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

/**
 * Everything the UI needs to show a price consistently, in one place so the
 * banner, the paywall, the modal and the actual charge can never disagree.
 *
 *   activeCents  → what the customer pays right now
 *   regularCents → the standard price (only meaningful when isPromo)
 *   isPromo      → whether a discount is active
 */
export type PriceView = {
  activeCents: number;
  regularCents: number;
  isPromo: boolean;
};

export async function priceView(): Promise<PriceView> {
  const promo = await getPromo();
  if (promo.enabled && promo.priceCents < PLAN_PRICE_CENTS) {
    return {
      activeCents: promo.priceCents,
      regularCents: PLAN_PRICE_CENTS,
      isPromo: true,
    };
  }
  return {
    activeCents: PLAN_PRICE_CENTS,
    regularCents: PLAN_PRICE_CENTS,
    isPromo: false,
  };
}

/**
 * Price the checkout should charge right now, and whether it's promotional.
 * Single source of truth so the banner, the paywall and the actual charge
 * can never disagree.
 */
export async function currentPrice(): Promise<{
  cents: number;
  promo: boolean;
}> {
  const promo = await getPromo();
  return promo.enabled
    ? { cents: promo.priceCents, promo: true }
    : { cents: PLAN_PRICE_CENTS, promo: false };
}
