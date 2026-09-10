"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCode } from "@/lib/access/format";
import { PLAN, formatCents } from "@/lib/plans";
import type { PriceView } from "@/lib/settings";
import { SubscribeButton } from "@/components/subscription/SubscribeButton";
import { PriceTag } from "@/components/subscription/PriceTag";

type Props = {
  /** null when the visitor has no valid code. */
  access: {
    code: string;
    isPermanent: boolean;
    expiresAt: string | null;
    daysLeft: number | null;
  } | null;
  /** True only for the master code — shows the link to /admin. */
  isOwner?: boolean;
  /** Active vs standard price, for the sales/renew copy. */
  price: PriceView;
};

/**
 * Profile / subscription screen.
 *
 * With no accounts in the system there's not much to show: the code itself,
 * how long it lasts, and the buttons to renew or sign out. Visitors without a
 * code see the sales pitch instead.
 */
export function ProfileView({ access, isOwner = false, price }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleLogout() {
    setBusy(true);
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/");
    router.refresh();
  }

  async function copyCode() {
    if (!access) return;
    try {
      await navigator.clipboard.writeText(access.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard unavailable — the code is visible on screen anyway */
    }
  }

  if (!access) return <NotSubscribed price={price} />;

  const expiryLabel = access.expiresAt
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(access.expiresAt))
    : null;

  // Nudge renewal in the final stretch.
  const expiringSoon =
    !access.isPermanent &&
    access.daysLeft !== null &&
    access.daysLeft <= 5;

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline-md text-[18px] text-on-surface">
            Seu acesso
          </h2>
          <span
            className={`font-label-md text-label-md uppercase tracking-wider ${
              access.isPermanent ? "text-emerald-300" : "text-primary-container"
            }`}
          >
            {access.isPermanent ? "Vitalício" : "Ativo"}
          </span>
        </div>

        <button
          onClick={copyCode}
          className="w-full text-left rounded-xl border border-white/10 bg-black px-4 py-3 hover:border-primary-container/40 transition-colors group"
          aria-label="Copiar código de acesso"
        >
          <span className="block font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">
            Código
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="font-mono-data text-[18px] tracking-[0.12em] text-on-surface break-all">
              {formatCode(access.code)}
            </span>
            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary-container text-[20px] shrink-0">
              {copied ? "check" : "content_copy"}
            </span>
          </span>
        </button>

        <p className="mt-3 font-body-md text-[13px] text-on-surface-variant">
          {access.isPermanent ? (
            "Este código não expira."
          ) : expiryLabel ? (
            <>
              Válido até{" "}
              <span className="font-mono-data text-on-surface">
                {expiryLabel}
              </span>
              {access.daysLeft !== null && (
                <>
                  {" "}
                  ({access.daysLeft}{" "}
                  {access.daysLeft === 1 ? "dia restante" : "dias restantes"})
                </>
              )}
            </>
          ) : (
            "Acesso ativo."
          )}
        </p>

        {expiringSoon && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary-container/40 bg-primary-container/10 px-3 py-2.5">
            <span className="material-symbols-outlined text-primary-container text-[18px] mt-0.5 shrink-0">
              schedule
            </span>
            <p className="font-body-md text-[12px] text-on-surface">
              Seu acesso está acabando. Renove para não perder as análises —
              você recebe um código novo.
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3">
          <SubscribeButton
            label={
              access.isPermanent
                ? `Comprar acesso extra (${formatCents(price.activeCents)})`
                : `Renovar por ${formatCents(price.activeCents)}`
            }
          />
          <button
            onClick={handleLogout}
            disabled={busy}
            className="w-full text-error font-label-md text-label-md uppercase tracking-wider py-2.5 rounded-xl border border-error/30 bg-error/5 hover:bg-error/10 transition-colors disabled:opacity-50"
          >
            Sair desta conta
          </button>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-6">
        <h3 className="font-headline-md text-[16px] text-on-surface mb-3">
          O que está incluído
        </h3>
        <ul className="flex flex-col gap-2">
          {PLAN.perks.map((p) => (
            <li
              key={p}
              className="flex items-start gap-2 font-body-md text-[13px] text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-emerald-300 text-[16px] mt-0.5">
                check_circle
              </span>
              {p}
            </li>
          ))}
        </ul>
      </section>

      <p className="px-1 font-body-md text-[12px] text-on-surface-variant">
        Guarde bem o seu código: ele é a única forma de entrar. Não há
        recuperação por email ou senha.
      </p>

      {isOwner && (
        <Link
          href="/admin"
          className="glass-card rounded-2xl p-4 flex items-center justify-between hover:border-primary-container/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container text-[20px]">
              dashboard
            </span>
            <span className="font-headline-md text-[14px] text-on-surface">
              Painel de controle
            </span>
          </span>
          <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
            arrow_forward
          </span>
        </Link>
      )}
    </div>
  );
}

/** Sales screen for visitors with no code. */
function NotSubscribed({ price }: { price: PriceView }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col items-center text-center pt-2">
        <div className="relative mb-5">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-container/30 to-secondary-container/30 blur-3xl rounded-full" />
          <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-container to-secondary-container flex items-center justify-center shadow-[0_0_40px_rgba(255,107,0,0.4)]">
            <span className="material-symbols-outlined text-white text-[36px]">
              bolt
            </span>
          </div>
        </div>
        <h1 className="font-display-lg text-[26px] leading-tight text-on-surface mb-2 tracking-tight">
          Libere todos
          <br />
          os jogos
        </h1>
        <p className="font-body-md text-[14px] text-on-surface-variant max-w-[320px]">
          Os 3 jogos da seção &ldquo;Análise grátis&rdquo; são sempre abertos.
          Assine para analisar qualquer jogo que você quiser.
        </p>
      </section>

      <section className="glass-card rounded-2xl p-6 border border-primary-container/40">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-md text-label-md uppercase tracking-wider text-primary-container">
            {PLAN.name}
          </span>
          <span className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant">
            30 dias
          </span>
        </div>
        <div className="mb-5">
          <PriceTag
            activeCents={price.activeCents}
            regularCents={price.regularCents}
            isPromo={price.isPromo}
            size="lg"
          />
        </div>

        <ul className="flex flex-col gap-2 mb-6">
          {PLAN.perks.map((p) => (
            <li
              key={p}
              className="flex items-start gap-2 font-body-md text-[13px] text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-emerald-300 text-[16px] mt-0.5">
                check_circle
              </span>
              {p}
            </li>
          ))}
        </ul>

        <SubscribeButton
          label={`Assinar por ${formatCents(price.activeCents)}`}
        />

        <p className="mt-4 font-body-md text-[12px] text-on-surface-variant text-center">
          Pagamento pela InfinitePay (Pix ou cartão). Ao aprovar, você recebe um
          código de 12 caracteres — é com ele que você entra.
        </p>
      </section>

      <p className="text-center font-body-md text-[14px] text-on-surface-variant">
        Já tem um código?{" "}
        <Link
          href="/entrar"
          className="text-primary-container font-semibold hover:opacity-80"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
