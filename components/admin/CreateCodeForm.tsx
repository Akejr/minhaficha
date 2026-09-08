"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCode } from "@/lib/access/format";

type Kind = "monthly" | "annual" | "lifetime";

const KINDS: { id: Kind; label: string; sub: string }[] = [
  { id: "monthly", label: "Mensal", sub: "30 dias" },
  { id: "annual", label: "Anual", sub: "365 dias" },
  { id: "lifetime", label: "Vitalício", sub: "não expira" },
];

/**
 * Mints an access code from the panel.
 *
 * The generated code is shown once, big, with copy-to-clipboard — same
 * reasoning as the customer-facing reveal screen: it can't be recovered by
 * email, so it has to be captured now. It also stays on screen until the
 * owner dismisses it, so a refresh doesn't lose it.
 */
export function CreateCodeForm() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("monthly");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    code: string;
    expiresAt: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, note: note.trim() || null }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        code?: string;
        expiresAt?: string | null;
        error?: string;
      };
      if (!res.ok || !json.code) {
        throw new Error(json.error ?? "Não foi possível criar o código.");
      }
      setCreated({ code: json.code, expiresAt: json.expiresAt ?? null });
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* code is on screen anyway */
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="font-headline-md text-[16px] text-on-surface mb-1">
        Criar código de acesso
      </h3>
      <p className="font-body-md text-[12px] text-on-surface-variant mb-4">
        Gera um código manualmente, sem passar por pagamento.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {KINDS.map((k) => {
          const active = kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              aria-pressed={active}
              className={`rounded-xl px-2 py-3 border transition-colors text-center ${
                active
                  ? "border-primary-container bg-primary-container/15"
                  : "border-white/10 bg-surface-container hover:border-white/20"
              }`}
            >
              <span
                className={`block font-label-md text-[12px] ${
                  active ? "text-primary-container" : "text-on-surface"
                }`}
              >
                {k.label}
              </span>
              <span className="block font-body-md text-[10px] text-on-surface-variant mt-0.5">
                {k.sub}
              </span>
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1.5 mb-4">
        <span className="font-label-md text-[11px] uppercase tracking-wider text-on-surface-variant">
          Rótulo (opcional)
        </span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ex: cortesia influenciador, teste, cliente X"
          maxLength={120}
          className="w-full bg-black border border-white/10 rounded-xl py-2.5 px-3 font-body-md text-[13px] text-on-surface placeholder:text-surface-variant focus:outline-none focus:border-primary-container transition-colors"
        />
      </label>

      <button
        onClick={submit}
        disabled={busy}
        className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-3.5 rounded-full hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <span className="material-symbols-outlined animate-spin text-[18px]">
              progress_activity
            </span>
            Criando...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[18px]">
              add_circle
            </span>
            Gerar código
          </>
        )}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-error font-body-md text-[12px]">
          {error}
        </p>
      )}

      {created && (
        <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="font-label-md text-[10px] uppercase tracking-wider text-emerald-300 mb-1">
            Código criado
          </p>
          <p className="font-mono-data text-[20px] tracking-[0.12em] text-on-surface select-all break-all">
            {formatCode(created.code)}
          </p>
          <p className="mt-1 font-body-md text-[11px] text-on-surface-variant">
            {created.expiresAt
              ? `Expira em ${new Intl.DateTimeFormat("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }).format(new Date(created.expiresAt))}`
              : "Não expira"}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={copy}
              className="flex-1 bg-surface-container border border-white/10 text-on-surface font-label-md text-[12px] py-2 rounded-full hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">
                {copied ? "check" : "content_copy"}
              </span>
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              onClick={() => setCreated(null)}
              className="px-4 font-label-md text-[12px] text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
