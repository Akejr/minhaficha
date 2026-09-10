"use client";

import { useState } from "react";
import { PLAN } from "@/lib/plans";
import { readAttribution, track } from "@/lib/tracking/client";

/**
 * Kicks off the InfinitePay checkout.
 *
 * Asks our server for a payment link (which also records the pending order)
 * and then hands the browser over to InfinitePay's hosted page. We navigate
 * with a full assignment rather than the Next router because the destination
 * is off-site.
 */
export function SubscribeButton({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Where this visitor came from. Sent now, at the one moment we know
        // both the campaign and the order it produced.
        body: JSON.stringify({ attribution: readAttribution() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        orderNsu?: string;
        amountCents?: number;
        error?: string;
      };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Não foi possível abrir o pagamento.");
      }

      // InitiateCheckout fires HERE — after the link exists, before we hand
      // the browser over. A failure above throws, so a checkout that never
      // opened is never reported. The value comes from the server response,
      // which is what the customer will actually be charged.
      if (json.orderNsu && typeof json.amountCents === "number") {
        track({
          name: "InitiateCheckout",
          orderNsu: json.orderNsu,
          valueCents: json.amountCents,
        });
      }

      window.location.href = json.url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível abrir o pagamento.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <button
        onClick={start}
        disabled={busy}
        className={
          className ??
          "w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_20px_rgba(255,107,0,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
        }
      >
        {busy ? (
          <>
            <span className="material-symbols-outlined animate-spin text-[18px]">
              progress_activity
            </span>
            Abrindo pagamento...
          </>
        ) : (
          <>
            {label ?? `Assinar por ${PLAN.priceLabel}`}
            <span className="material-symbols-outlined text-[18px]">
              arrow_forward
            </span>
          </>
        )}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-error font-body-md text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}
