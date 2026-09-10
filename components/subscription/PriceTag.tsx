import { formatCents } from "@/lib/plans";

/**
 * Consistent price display used everywhere subscription is mentioned.
 *
 * When a promo is active it shows the promotional price big, the standard
 * price struck through, and a "-N%" badge — so it is always clear that R$ 15
 * is a discount off the R$ 50 standard price, which is exactly the messaging
 * the owner asked for.
 */
export function PriceTag({
  activeCents,
  regularCents,
  isPromo,
  size = "lg",
  cycleLabel = "/mês",
}: {
  activeCents: number;
  regularCents: number;
  isPromo: boolean;
  size?: "lg" | "md";
  /**
   * Billing period shown next to the price. Override where the copy is
   * explicit that access does not renew — "/mês" would contradict it.
   */
  cycleLabel?: string;
}) {
  const big = size === "lg" ? "text-[40px]" : "text-[30px]";
  const discountPct =
    regularCents > 0
      ? Math.round(((regularCents - activeCents) / regularCents) * 100)
      : 0;

  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`font-display-lg ${big} text-on-surface leading-none`}>
          {formatCents(activeCents)}
        </span>
        <span className="font-headline-md text-[14px] text-on-surface-variant">
          {cycleLabel}
        </span>
        {isPromo && (
          <span className="font-label-md text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
            -{discountPct}%
          </span>
        )}
      </div>
      {isPromo && (
        <p className="mt-1 font-body-md text-[12px] text-on-surface-variant">
          De{" "}
          <span className="line-through">{formatCents(regularCents)}</span> por{" "}
          <span className="text-on-surface font-semibold">
            {formatCents(activeCents)}
          </span>{" "}
          — promoção por tempo limitado.
        </p>
      )}
    </div>
  );
}
