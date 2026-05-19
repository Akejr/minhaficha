"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { AuthShell, IconField } from "./AuthShell";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get("returnTo") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) throw err;
      router.replace(returnTo);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro inesperado. Tenta de novo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      icon="lock_open"
      eyebrow="Bem-vindo"
      title={
        <>
          Entra na tua{" "}
          <span className="bg-gradient-to-r from-primary-container to-secondary-container bg-clip-text text-transparent">
            Ficha
          </span>
        </>
      }
      subtitle="Continua de onde paraste e vê as próximas análises da IA."
      footerText="Ainda não tens conta?"
      footerLinkText="Criar conta grátis"
      footerLinkHref="/registar"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <IconField
          icon="alternate_email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
        <IconField
          icon="lock"
          label="Palavra-passe"
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
        />

        {error && (
          <div className="text-error font-body-md text-[13px] bg-error/10 border border-error/20 rounded-lg px-3 py-2 flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] mt-0.5">
              error
            </span>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md py-4 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_20px_rgba(255,107,0,0.4)] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
        >
          {busy ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
              A entrar...
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
      </form>
    </AuthShell>
  );
}
