"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/plans";

/**
 * Switch for the first-month promo shown on free analyses.
 *
 * The price is editable here because it's the same number the checkout
 * charges — showing one figure and billing another would be false advertising,
 * so there is deliberately no second place to configure it.
 */
export function PromoToggle({
  enabled,
  priceCents,
  regularCents,
}: {
  enabled: boolean;
  priceCents: number;
  regularCents: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [price, setPrice] = useState(String((priceCents / 100).toFixed(2)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(nextEnabled: boolean, nextPriceReais: string) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const cents = Math.round(Number(nextPriceReais.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents <= 0) {
        throw new Error("Informe um valor válido.");
      }
      if (cents > regularCents) {
        throw new Error(
          `A promoção não pode custar mais que o preço normal (${formatCents(regularCents)}).`,
        );
      }

      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled, priceCents: cents }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Não foi possível salvar.");

      setOn(nextEnabled);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setOn(enabled); // roll back the visual state
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-headline-md text-[16px] text-on-surface">
            Promoção do 1º mês
          </h3>
          <p className="font-body-md text-[12px] text-on-surface-variant mt-0.5">
            Aparece para quem abre uma análise grátis sem ter código.
          </p>
        </div>

        <button
          role="switch"
          aria-checked={on}
          aria-label="Ativar promoção do primeiro mês"
          disabled={busy}
          onClick={() => save(!on, price)}
          className={`relative shrink-0 w-12 h-7 rounded-full border transition-colors disabled:opacity-50 ${
            on
              ? "bg-emerald-500/30 border-emerald-500/60"
              : "bg-surface-container border-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
              on
                ? "left-[26px] bg-emerald-300"
                : "left-0.5 bg-on-surface-variant"
            }`}
          />
        </button>
      </div>

      <div className="flex items-end gap-2 mt-4">
        <label className="flex-1 flex flex-col gap-1.5">
          <span className="font-label-md text-[11px] uppercase tracking-wider text-on-surface-variant">
            Preço promocional (R$)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full bg-black border border-white/10 rounded-xl py-2.5 px-3 font-mono-data text-[14px] text-on-surface focus:outline-none focus:border-primary-container transition-colors"
          />
        </label>
        <button
          onClick={() => save(on, price)}
          disabled={busy}
          className="rounded-xl border border-white/10 bg-surface-container px-4 py-2.5 font-label-md text-[12px] text-on-surface hover:border-white/20 transition-colors disabled:opacity-50"
        >
          {busy ? "..." : "Salvar"}
        </button>
      </div>

      <p className="mt-3 font-body-md text-[11px] text-on-surface-variant">
        {on ? (
          <>
            Ativa. O checkout está cobrando{" "}
            <span className="text-on-surface">
              {formatCents(Math.round(Number(price.replace(",", ".")) * 100) || 0)}
            </span>{" "}
            em vez de {formatCents(regularCents)}.
          </>
        ) : (
          <>
            Desativada. O checkout cobra o preço normal de{" "}
            {formatCents(regularCents)} e o aviso não aparece.
          </>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-2 font-body-md text-[12px] text-error">
          {error}
        </p>
      )}
      {saved && (
        <p className="mt-2 font-body-md text-[12px] text-emerald-300">
          Salvo.
        </p>
      )}
    </div>
  );
}
