"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCode } from "@/lib/access/format";

/**
 * Shows the freshly issued access code.
 *
 * This is the single most important screen in the purchase flow: the code is
 * the customer's only credential, so the copy leans hard on "save this now".
 * We offer copy-to-clipboard and a one-tap "enter now" that logs them in via
 * /api/session so they don't have to retype it.
 */
export function CodeReveal({
  code,
  expiresAt,
  validityDays,
}: {
  code: string;
  expiresAt: string | null;
  validityDays: number;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiryLabel = expiresAt
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(expiresAt))
    : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Não foi possível copiar. Anote o código manualmente.");
    }
  }

  async function enterNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(json.error ?? "Não foi possível entrar.");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col items-center text-center pt-4">
      <div className="relative mb-5">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 to-primary-container/30 blur-3xl rounded-full" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-primary-container flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.35)]">
          <span className="material-symbols-outlined text-white text-[36px]">
            check_circle
          </span>
        </div>
      </div>

      <span className="font-label-md text-label-md uppercase tracking-[0.2em] text-emerald-300 mb-2">
        Pagamento aprovado
      </span>
      <h1 className="font-display-lg text-[26px] leading-tight text-on-surface mb-2 tracking-tight">
        Este é o seu
        <br />
        código de acesso
      </h1>

      {/* The code itself — biggest thing on the screen. */}
      <div className="w-full glass-card rounded-2xl p-6 mt-4 mb-4 border border-primary-container/40">
        <p
          className="font-display-lg text-[30px] leading-none text-on-surface tracking-[0.12em] select-all break-all"
          aria-label={`Código de acesso: ${code.split("").join(" ")}`}
        >
          {formatCode(code)}
        </p>
        <p className="mt-3 font-body-md text-[12px] text-on-surface-variant">
          {expiryLabel
            ? `Válido até ${expiryLabel} (${validityDays} dias)`
            : `Válido por ${validityDays} dias`}
        </p>
      </div>

      {/* The warning is the point of this screen. */}
      <div
        role="alert"
        className="w-full flex items-start gap-2 text-left rounded-xl border border-primary-container/40 bg-primary-container/10 px-4 py-3 mb-5"
      >
        <span className="material-symbols-outlined text-primary-container text-[20px] mt-0.5 shrink-0">
          warning
        </span>
        <p className="font-body-md text-[13px] text-on-surface">
          <strong className="font-semibold">Salve este código agora.</strong>{" "}
          Ele é a sua única forma de entrar no ApostAI — não enviamos por email
          e não há recuperação por senha. Tire um print ou copie para as suas
          notas.
        </p>
      </div>

      <div className="w-full flex flex-col gap-3">
        <button
          onClick={copy}
          className="w-full bg-surface-container border border-white/10 text-on-surface font-label-md text-label-md py-3.5 rounded-full hover:bg-surface-container-high transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">
            {copied ? "check" : "content_copy"}
          </span>
          {copied ? "Código copiado" : "Copiar código"}
        </button>

        <button
          onClick={enterNow}
          disabled={busy}
          className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
              Entrando...
            </>
          ) : (
            <>
              Entrar agora
              <span className="material-symbols-outlined text-[18px]">
                arrow_forward
              </span>
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="mt-4 text-error font-body-md text-[13px]">{error}</p>
      )}
    </section>
  );
}
