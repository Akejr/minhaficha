import Link from "next/link";
import { getCurrentAccess } from "@/lib/access/session";
import { priceView } from "@/lib/settings";
import { formatCents } from "@/lib/plans";

/**
 * Should the promo strip be shown right now?
 *
 * Only to logged-out visitors, and only while a promo is active — subscribers
 * already paid, so nagging them is pointless. Exposed so the layout can add
 * `has-promo` to <body>, which shifts the fixed header and every <main> down
 * by --promo-height (see globals.css).
 */
export async function shouldShowPromoBar(): Promise<boolean> {
  const [access, price] = await Promise.all([getCurrentAccess(), priceView()]);
  return !access && price.isPromo;
}

/**
 * Thin fixed strip pinned to the very top, above the header. Reinforces that
 * R$ 15 is a limited-time price off R$ 50 on every page the visitor lands on.
 *
 * Height must match `--promo-height` in globals.css (30px text band; the
 * safe-area inset is added on top here). Returns null when it shouldn't show,
 * and the layout omits `has-promo` in that case, so the header sits at top: 0
 * as before.
 */
export async function PromoBar() {
  if (!(await shouldShowPromoBar())) return null;

  const price = await priceView();

  return (
    <Link
      href="/perfil"
      aria-label="Aproveitar a promoção e assinar"
      className="fixed top-0 left-0 right-0 z-[60] mx-auto max-w-[440px] block bg-gradient-to-r from-primary-container to-secondary-container text-white text-center hover:opacity-95 active:opacity-90 transition-opacity"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <p className="h-[30px] flex items-center justify-center px-3 font-label-md text-[11px] leading-none tracking-wide">
        <span className="material-symbols-outlined text-[14px] mr-1">bolt</span>
        Por tempo limitado: mensalidade por{" "}
        <strong className="mx-1">{formatCents(price.activeCents)}</strong>
        <span className="opacity-80">
          (em vez de {formatCents(price.regularCents)})
        </span>
        <span className="material-symbols-outlined text-[14px] ml-1">
          arrow_forward
        </span>
      </p>
    </Link>
  );
}
