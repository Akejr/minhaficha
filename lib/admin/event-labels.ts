/**
 * Presentation metadata for event types.
 *
 * Pure data with no imports, so both the server dashboard and the client-side
 * live feed can use it without dragging anything extra into the browser bundle.
 */

export type EventTone = "neutral" | "good" | "bad" | "accent" | "muted";

export const EVENT_LABELS: Record<
  string,
  { label: string; tone: EventTone; group: EventGroup }
> = {
  checkout_click: { label: "clicou em pagar", tone: "accent", group: "pagamento" },
  checkout_created: { label: "link de pagamento gerado", tone: "neutral", group: "pagamento" },
  checkout_failed: { label: "falha ao gerar link", tone: "bad", group: "pagamento" },
  payment_confirmed: { label: "pagamento confirmado", tone: "good", group: "pagamento" },
  payment_unconfirmed: { label: "pagamento não confirmado", tone: "bad", group: "pagamento" },
  payment_underpaid: { label: "pagou menos que o devido", tone: "bad", group: "pagamento" },

  analysis_view: { label: "análise vista", tone: "neutral", group: "análise" },
  analysis_computed: { label: "análise calculada", tone: "accent", group: "análise" },
  analysis_blocked: { label: "paywall exibido", tone: "muted", group: "análise" },

  login_success: { label: "entrou", tone: "good", group: "acesso" },
  login_failed: { label: "código recusado", tone: "bad", group: "acesso" },
  logout: { label: "saiu", tone: "muted", group: "acesso" },

  code_created: { label: "código criado", tone: "good", group: "códigos" },
  code_revoked: { label: "código revogado", tone: "bad", group: "códigos" },
};

export type EventGroup = "pagamento" | "análise" | "acesso" | "códigos";

/** Filter presets for the events screen. */
export const EVENT_FILTERS: { id: string; label: string; types: string[] }[] = [
  { id: "all", label: "Tudo", types: [] },
  {
    id: "pagamento",
    label: "Pagamento",
    types: [
      "checkout_click",
      "checkout_created",
      "checkout_failed",
      "payment_confirmed",
      "payment_unconfirmed",
      "payment_underpaid",
    ],
  },
  {
    id: "analise",
    label: "Análises",
    types: ["analysis_view", "analysis_computed", "analysis_blocked"],
  },
  {
    id: "acesso",
    label: "Acesso",
    types: ["login_success", "login_failed", "logout"],
  },
  {
    id: "problemas",
    label: "Problemas",
    types: [
      "checkout_failed",
      "payment_unconfirmed",
      "payment_underpaid",
      "login_failed",
    ],
  },
];

export function eventLabel(type: string) {
  return (
    EVENT_LABELS[type] ?? {
      label: type,
      tone: "neutral" as EventTone,
      group: "acesso" as EventGroup,
    }
  );
}

export function toneClass(tone: EventTone): string {
  switch (tone) {
    case "good":
      return "text-emerald-300";
    case "bad":
      return "text-error";
    case "accent":
      return "text-primary-container";
    case "muted":
      return "text-on-surface-variant/70";
    default:
      return "text-on-surface";
  }
}
