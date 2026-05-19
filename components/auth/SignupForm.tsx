"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { AuthShell, IconField } from "./AuthShell";

const PHONE_RE = /^\+?[0-9\s-]{8,16}$/;

export function SignupForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!PHONE_RE.test(phone.trim())) {
        throw new Error("Número de telefone inválido.");
      }
      if (password.length < 8) {
        throw new Error("Palavra-passe deve ter pelo menos 8 caracteres.");
      }
      const supabase = getBrowserClient();
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { phone: phone.trim(), display_name: name.trim() || null },
        },
      });
      if (err) throw err;
      router.replace("/");
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
      icon="person_add"
      eyebrow="Conta grátis"
      title={
        <>
          Cria a tua{" "}
          <span className="bg-gradient-to-r from-primary-container to-secondary-container bg-clip-text text-transparent">
            Ficha
          </span>
        </>
      }
      subtitle="2 análises grátis por dia. Sem compromisso."
      footerText="Já tens conta?"
      footerLinkText="Entrar"
      footerLinkHref="/entrar"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <IconField
          icon="person"
          label="Nome"
          type="text"
          value={name}
          onChange={setName}
          autoComplete="name"
        />
        <IconField
          icon="call"
          label="Telefone"
          type="tel"
          value={phone}
          onChange={setPhone}
          required
          placeholder="+244 9XX XXX XXX"
          autoComplete="tel"
        />
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
          autoComplete="new-password"
          placeholder="mínimo 8 caracteres"
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
              A criar conta...
            </>
          ) : (
            <>
              Criar conta grátis
              <span className="material-symbols-outlined text-[18px]">
                arrow_forward
              </span>
            </>
          )}
        </button>

        <p className="text-center text-on-surface-variant text-[11px] font-body-md mt-1">
          Ao criares conta aceitas a nossa análise estatística sem garantia
          de retorno financeiro.
        </p>
      </form>
    </AuthShell>
  );
}
