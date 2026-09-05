/**
 * Pricing. One plan, one price.
 *
 * The free tier is not a quota any more: the three fixtures in the
 * "Análise grátis" section on the home page are always open, to anyone,
 * with no login (see lib/free-fixtures.ts). Everything else needs a paid
 * access code.
 */

/** Monthly price in cents — InfinitePay expects cents. */
export const PLAN_PRICE_CENTS = 1500;

export const PLAN = {
  name: "Mensal",
  priceCents: PLAN_PRICE_CENTS,
  priceLabel: "R$ 15,00",
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
