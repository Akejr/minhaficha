/**
 * Pricing. One plan, one price.
 *
 * The free tier is not a quota any more: the three fixtures in the
 * "Análise grátis" section on the home page are always open, to anyone,
 * with no login (see lib/free-fixtures.ts). Everything else needs a paid
 * access code.
 *
 * Two prices exist:
 *   - PLAN_PRICE_CENTS   → the standard ("de") price, R$ 50,00
 *   - the promo price    → configured in /admin (lib/settings.ts), R$ 15,00
 *
 * When the promo is on (which is the intended default marketing posture) the
 * UI always shows R$ 15 as the active price with R$ 50 struck through, so the
 * discount is visible everywhere subscription is mentioned.
 */

/** Standard price in cents — the "de" price shown struck through. */
export const PLAN_PRICE_CENTS = 5000;

export const PLAN = {
  name: "Mensal",
  priceCents: PLAN_PRICE_CENTS,
  priceLabel: "R$ 50,00",
  cycleLabel: "por 30 dias",
  /** Line item description sent to the InfinitePay checkout. */
  checkoutItemName: "ApostAI — acesso por 30 dias",
  perks: [
    "Análises ilimitadas, qualquer jogo",
    "As 3 sugestões (baixo, médio e alto risco)",
    "Histórico completo salvo",
    "Acesso por código, sem cadastro",
  ],
} as const;

/** Format a cents amount as Brazilian currency: 1500 → R$ 15,00 */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
