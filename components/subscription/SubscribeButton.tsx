"use client";

import { useState } from "react";
import { PLAN } from "@/lib/plans";

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
      const res = await fetch("/api/checkout", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Não foi possível abrir o pagamento.");
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
