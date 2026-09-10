"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SubscribeButton } from "./SubscribeButton";
import { formatCents } from "@/lib/plans";
import { SubscriptionOfferTracker } from "@/components/tracking/FunnelTrackers";

/**
 * Promo shown when a visitor opens one of the FREE analyses.
 *
 * That's the moment of maximum intent: they've just seen the product deliver
 * for free, so it's when the upgrade makes most sense.
 *
 * Two things keep it from being obnoxious:
 *   - it appears once per browser session (sessionStorage), not on every free
 *     analysis, so browsing three free games doesn't mean three modals;
 *   - it opens after a short delay, so the analysis is visible first and the
 *     modal doesn't feel like a doorway blocking the content they came for.
 *
 * The price shown is the one the checkout charges — both read the same setting
 * server-side (lib/settings.ts).
 *
 * RENDERED THROUGH A PORTAL, and that is not optional. This component is used
 * inside <main>, and any ancestor carrying a transform / filter / backdrop-
 * filter becomes the containing block for `position: fixed` children — the
 * overlay then anchors to that element instead of the viewport and ends up
 * somewhere down the page. Portalling to <body> makes it immune to whatever
 * the page around it is doing.
 */

const SESSION_KEY = "apostai_promo_seen";
const OPEN_DELAY_MS = 1800;

export function FreeAnalysisPromo({
  priceCents,
  regularCents,
}: {
  priceCents: number;
  regularCents: number;
}) {
  const [open, setOpen] = useState(false);
  // Portals need a DOM, so nothing renders until we're mounted on the client.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // Private mode can throw on storage access — treat as unseen.
    }
    if (seen) return;

    const t = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* non-critical */
    }
  }

  // Escape closes, and the page behind must not scroll while it's open.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!mounted || !open) return null;

  const discount = Math.max(0, regularCents - priceCents);
  const discountPct =
    regularCents > 0 ? Math.round((discount / regularCents) * 100) : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-title"
    >
      {/* Backdrop — tapping outside closes. */}
      <button
        aria-label="Fechar"
        onClick={dismiss}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-[380px] my-auto glass-card rounded-2xl border border-primary-container/50 p-6 shadow-[0_0_40px_rgba(255,107,0,0.25)]">
        {/* This subtree only exists while the modal is open, so being mounted
            IS being visible — no observer needed. */}
        <SubscriptionOfferTracker surface="free_analysis_modal" immediate />
        <button
          onClick={dismiss}
          aria-label="Fechar"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-container/40 bg-primary-container/10 px-3 py-1 font-label-md text-[10px] uppercase tracking-wider text-primary-container">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse" />
          Promoção limitada
        </span>

        <h2
          id="promo-title"
          className="font-display-lg text-[24px] leading-tight tracking-tight text-on-surface mt-4"
        >
          Gostou da análise grátis?
        </h2>

        <p className="font-body-md text-[14px] leading-relaxed text-on-surface-variant mt-2">
          Garanta agora o seu primeiro mês e libere{" "}
          <span className="text-on-surface font-semibold">qualquer jogo</span> —
          não só os três do dia.
        </p>

        <div className="flex items-baseline gap-2 mt-5 flex-wrap">
          <span className="font-display-lg text-[38px] leading-none text-on-surface">
            {formatCents(priceCents)}
          </span>
          {discount > 0 && (
            <>
              <span className="font-body-md text-[15px] text-on-surface-variant line-through">
                {formatCents(regularCents)}
              </span>
              <span className="font-label-md text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                -{discountPct}%
              </span>
            </>
          )}
        </div>
        <p className="font-body-md text-[12px] text-on-surface-variant mt-1">
          no primeiro mês · 30 dias de acesso
        </p>

        <div className="mt-5">
          <SubscribeButton label={`Garantir por ${formatCents(priceCents)}`} />
        </div>

        <button
          onClick={dismiss}
          className="mt-3 w-full font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors py-2"
        >
          Agora não, continuar lendo
        </button>

        <p className="mt-2 text-center font-body-md text-[10px] text-on-surface-variant/60">
          Pagamento único, não renova automaticamente.
        </p>
      </div>
    </div>,
    document.body,
  );
}
