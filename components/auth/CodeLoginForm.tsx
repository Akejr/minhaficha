"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "./AuthShell";
import { CODE_LENGTH, normalizeCode } from "@/lib/access/format";
import { PLAN } from "@/lib/plans";

/**
 * The only login screen: one field, the access code.
 *
 * We normalise as the user types (uppercase, drop separators) so a code
 * pasted as "abcd-efgh-jkmn" works exactly like "ABCDEFGHJKMN".
 *
 * The master code is shorter than 12 chars, so we can't hard-require the
 * length client-side — the server decides. We only block the empty case.
 */
export function CodeLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get("returnTo") ?? "/";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const normalized = normalizeCode(code);
      if (!normalized) throw new Error("Digite o seu código de acesso.");

      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(json.error ?? "Código inválido ou expirado.");
      }
      router.replace(returnTo);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro inesperado. Tente de novo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      icon="vpn_key"
      eyebrow="Acesso"
      title={
        <>
          Entre com seu{" "}
          <span className="bg-gradient-to-r from-primary-container to-secondary-container bg-clip-text text-transparent">
            código
          </span>
        </>
      }
      subtitle="Use o código que você recebeu depois do pagamento. Sem email, sem senha."
      footerText="Ainda não tem um código?"
      footerLinkText={`Assinar por ${PLAN.priceLabel}`}
      footerLinkHref="/perfil"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-label-md text-[12px] uppercase tracking-wider text-on-surface-variant">
            Código de acesso
          </span>
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-on-surface-variant text-[20px] pointer-events-none">
              vpn_key
            </span>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              maxLength={CODE_LENGTH}
              placeholder="ABCDEFGHJKMN"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              aria-describedby="code-hint"
              className="w-full bg-black border border-white/10 rounded-xl py-3.5 pl-12 pr-4 font-mono-data text-[18px] tracking-[0.15em] text-on-surface placeholder:text-surface-variant placeholder:tracking-normal focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-colors"
            />
          </div>
          <span
            id="code-hint"
            className="font-body-md text-[11px] text-on-surface-variant"
          >
            {CODE_LENGTH} caracteres. Pode colar com ou sem os tracinhos.
          </span>
        </label>

        {error && (
          <div
            role="alert"
            className="text-error font-body-md text-[13px] bg-error/10 border border-error/20 rounded-lg px-3 py-2 flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-[18px] mt-0.5">
              error
            </span>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_20px_rgba(255,107,0,0.4)] disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
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
              Entrar
              <span className="material-symbols-outlined text-[18px]">
                arrow_forward
              </span>
            </>
          )}
        </button>

        <p className="text-center text-on-surface-variant text-[11px] font-body-md">
          Perdeu o código? Ele fica válido por 30 dias a partir da compra. Sem
          ele é preciso assinar de novo.
        </p>
      </form>
    </AuthShell>
  );
}
