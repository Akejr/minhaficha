/**
 * InfinitePay Checkout integration.
 *
 * Docs: https://www.infinitepay.io/checkout-documentacao
 * (content summarised here; rephrased for compliance with licensing
 * restrictions)
 *
 * Flow:
 *   1. createCheckoutLink() → POST /links
 *      returns a hosted payment URL we redirect the customer to.
 *   2. Customer pays, taps "Continuar", and InfinitePay sends them to our
 *      `redirect_url` with query params: receipt_url, order_nsu, slug,
 *      capture_method, transaction_nsu.
 *   3. In parallel InfinitePay POSTs our `webhook_url` once the payment is
 *      approved. The webhook is the authoritative signal (the docs
 *      recommend it over polling).
 *   4. checkPayment() → POST /payment_check
 *      lets us confirm a payment on demand, which we use as a fallback on
 *      the success page when the webhook hasn't landed yet.
 *
 * There is no API key: the account is identified by the `handle`
 * (your InfiniteTag without the leading "$").
 *
 * Amounts are always in CENTS — R$ 15,00 is 1500.
 */

/**
 * Documented base host for the Integrated Checkout API.
 *
 * Note: `https://api.infinitepay.io/invoices/public/checkout/*` also answers
 * and will happily create links, but its `payment_check` always reports
 * `success: false` — it is NOT an equivalent alias. Use this host only.
 */
const API_BASE = "https://api.checkout.infinitepay.io";

export type CheckoutItem = {
  /**
   * Line description shown on the checkout page.
   *
   * The API field is `description` — sending `name` fails validation with
   * `{"items":{"0":{"description":["is missing"]}}}`.
   */
  description: string;
  price: number; // cents
  quantity: number;
};

export type CreateLinkArgs = {
  orderNsu: string;
  items: CheckoutItem[];
  redirectUrl?: string;
  webhookUrl?: string;
  customer?: {
    name?: string;
    email?: string;
    phone_number?: string;
  };
};

export class InfinitePayError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "InfinitePayError";
    this.status = status;
    this.code = code;
  }
}

function handle(): string {
  const h = process.env.INFINITEPAY_HANDLE;
  if (!h) {
    throw new InfinitePayError(
      "INFINITEPAY_HANDLE não configurado. Adicione sua InfiniteTag (sem o $) ao ambiente.",
      500,
    );
  }
  // Tolerate a leading "$" in case it's pasted straight from the app.
  return h.replace(/^\$/, "").trim();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    throw new InfinitePayError(
      `Falha de rede ao falar com a InfinitePay: ${
        err instanceof Error ? err.message : String(err)
      }`,
      502,
    );
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* non-JSON body — handled below */
    }
  }

  if (!res.ok) {
    const message =
      (typeof json.message === "string" && json.message) ||
      (typeof json.error === "string" && json.error) ||
      `InfinitePay respondeu ${res.status}.`;
    const code = typeof json.error === "string" ? json.error : undefined;
    throw new InfinitePayError(message, res.status, code);
  }

  return json as T;
}

type CreateLinkResponse = {
  success?: boolean;
  url?: string;
  payment_url?: string;
  checkout_url?: string;
  data?: { url?: string };
};

/**
 * Create a hosted checkout link. Returns the URL to send the customer to.
 *
 * The response field carrying the URL has varied across doc revisions, so
 * we accept the known aliases rather than hard-failing on one shape.
 */
export async function createCheckoutLink(
  args: CreateLinkArgs,
): Promise<string> {
  const payload: Record<string, unknown> = {
    handle: handle(),
    order_nsu: args.orderNsu,
    items: args.items.map((i) => ({
      description: i.description,
      price: i.price,
      quantity: i.quantity,
    })),
  };
  if (args.redirectUrl) payload.redirect_url = args.redirectUrl;
  if (args.webhookUrl) payload.webhook_url = args.webhookUrl;
  if (args.customer) payload.customer = args.customer;

  const res = await post<CreateLinkResponse>("/links", payload);

  const url =
    res.url ?? res.payment_url ?? res.checkout_url ?? res.data?.url ?? null;
  if (!url) {
    throw new InfinitePayError(
      "InfinitePay não retornou a URL de pagamento.",
      502,
    );
  }
  return url;
}

/**
 * Guard against an underpaid or tampered checkout: confirm the settled amount
 * covers what the order was supposed to cost.
 *
 * If the API omitted the amounts we accept it, because `paid: true` already
 * came from InfinitePay — we just can't cross-check the value.
 */
export function amountCovers(
  result: PaymentCheckResult,
  expectedCents: number,
): boolean {
  const settled = result.paidAmountCents ?? result.amountCents;
  if (settled == null) return true;
  return settled >= expectedCents;
}

export type PaymentCheckResult = {
  paid: boolean;
  /** Amount charged, in cents. null when the API didn't report it. */
  amountCents: number | null;
  /** Amount actually settled, in cents. */
  paidAmountCents: number | null;
  captureMethod: string | null;
  raw: Record<string, unknown>;
};

/**
 * Ask InfinitePay whether a given transaction was actually paid.
 *
 * Used as a fallback: the webhook is the primary signal, but a customer who
 * lands on the success page before the webhook arrives still needs their
 * code, so we verify on demand.
 *
 * Contract (verified against the live API with a real Pix payment):
 *
 *   request  { handle, order_nsu, transaction_nsu, slug }
 *   paid     { success: true, paid: true, amount: 1500, paid_amount: 1500,
 *              installments: 1, capture_method: "pix" }
 *   unpaid   { success: false }
 *
 * `paid` is the authoritative flag. We require it explicitly rather than
 * inferring from `success`, so a response we don't understand fails closed.
 *
 * A 404 means "no such payment" rather than a transport failure, so we
 * translate it into `paid: false` instead of throwing.
 */
export async function checkPayment(args: {
  transactionNsu?: string | null;
  orderNsu?: string | null;
  slug?: string | null;
}): Promise<PaymentCheckResult> {
  const payload: Record<string, unknown> = { handle: handle() };
  if (args.transactionNsu) payload.transaction_nsu = args.transactionNsu;
  if (args.orderNsu) payload.order_nsu = args.orderNsu;
  if (args.slug) payload.slug = args.slug;

  const toCents = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  try {
    const res = await post<Record<string, unknown>>("/payment_check", payload);
    return {
      paid: res.paid === true,
      amountCents: toCents(res.amount),
      paidAmountCents: toCents(res.paid_amount),
      captureMethod:
        typeof res.capture_method === "string" ? res.capture_method : null,
      raw: res,
    };
  } catch (err) {
    if (err instanceof InfinitePayError && err.status === 404) {
      return {
        paid: false,
        amountCents: null,
        paidAmountCents: null,
        captureMethod: null,
        raw: {},
      };
    }
    throw err;
  }
}
