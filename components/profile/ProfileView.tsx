"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import {
  effectivePlan,
  isPaid,
  PLANS,
  type PlanInfo,
} from "@/lib/plans";
import type { Plan, Profile } from "@/lib/supabase/types";

type Props = {
  email: string;
  profile: Profile | null;
  usedToday: number;
  dailyLimit: number;
};

export function ProfileView({ email, profile, usedToday, dailyLimit }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const plan = effectivePlan(profile);
  const planInfo = PLANS[plan];
  const expires = profile?.plan_expires_at
    ? new Date(profile.plan_expires_at)
    : null;

  async function handleLogout() {
    setBusy(true);
    const sb = getBrowserClient();
    await sb.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  /**
   * Switch plan locally (no payment yet). Sets expires_at to now + cycle.
   * In production this is replaced by a webhook from the payment provider.
   */
  async function changePlan(target: Plan) {
    setBusy(true);
    const sb = getBrowserClient();
    let expiresAt: string | null = null;
    if (target === "weekly") {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (target === "monthly") {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    const { error } = await sb
      .from("profiles")
      .update({ plan: target, plan_expires_at: expiresAt })
      .eq("id", profile?.id ?? "");
    setBusy(false);
    if (error) {
      alert(`Erro: ${error.message}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-primary-container/20 border border-primary-container/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary-container text-[28px]">
              person
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-headline-md text-[18px] text-on-surface truncate">
              {profile?.display_name || email}
            </p>
            <p className="font-body-md text-[13px] text-on-surface-variant truncate">
              {email}
            </p>
            {profile?.phone && (
              <p className="font-body-md text-[13px] text-on-surface-variant">
                {profile.phone}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleLogout}
          disabled={busy}
          className="w-full text-error font-label-md text-label-md uppercase tracking-wider py-2.5 rounded-xl border border-error/30 bg-error/5 hover:bg-error/10 transition-colors disabled:opacity-50"
        >
          Terminar sessão
        </button>
      </section>

      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline-md text-[18px] text-on-surface">
            Plano atual
          </h2>
          <span className="font-label-md text-label-md text-primary-container uppercase tracking-wider">
            {planInfo.name}
          </span>
        </div>

        {plan === "free" ? (
          <div className="font-body-md text-on-surface-variant">
            Usaste{" "}
            <span className="font-mono-data text-on-surface">{usedToday}</span>{" "}
            de{" "}
            <span className="font-mono-data text-on-surface">{dailyLimit}</span>{" "}
            análises hoje. As sugestões de baixo e alto risco ficam bloqueadas.
          </div>
        ) : (
          <div className="font-body-md text-on-surface-variant">
            {isPaid(profile) && expires ? (
              <>
                Válido até{" "}
                <span className="font-mono-data text-on-surface">
                  {new Intl.DateTimeFormat("pt-PT", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }).format(expires)}
                </span>
                . Análises ilimitadas e as 3 sugestões em todos os jogos.
              </>
            ) : (
              "Plano expirado. Renova para continuar com acesso completo."
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="font-headline-md text-[16px] text-on-surface mb-3 px-1">
          Mudar de plano
        </h3>
      <div className="grid grid-cols-1 gap-3">
        {(["free", "weekly", "monthly"] as const).map((id) => (
          <PlanCard
              key={id}
              info={PLANS[id]}
              isCurrent={plan === id}
              onSelect={() => changePlan(id)}
              disabled={busy}
            />
          ))}
        </div>
        <p className="mt-3 px-1 font-body-md text-[12px] text-on-surface-variant">
          Os pagamentos ainda não estão integrados. A troca de plano funciona
          de forma manual nesta versão.
        </p>
      </section>
    </div>
  );
}

function PlanCard({
  info,
  isCurrent,
  onSelect,
  disabled,
}: {
  info: PlanInfo;
  isCurrent: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const featured = info.id === "monthly";
  return (
    <article
      className={`glass-card rounded-2xl p-5 flex flex-col ${
        featured ? "border border-primary-container/40 shadow-[0_0_20px_rgba(255,107,0,0.15)]" : ""
      } ${isCurrent ? "ring-1 ring-primary-container/60" : ""}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-headline-md text-[16px] text-on-surface">
          {info.name}
        </h4>
        {featured && (
          <span className="font-label-md text-[10px] uppercase tracking-wider text-primary-container">
            Mais popular
          </span>
        )}
      </div>
      <p className="font-display-lg text-[28px] text-on-surface leading-none">
        {info.pricePerCycleLabel}
      </p>
      <p className="font-body-md text-[12px] text-on-surface-variant mb-4">
        {info.cycleLabel}
      </p>
      <ul className="flex flex-col gap-1.5 mb-5 flex-1">
        {info.perks.map((p) => (
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
      <button
        onClick={onSelect}
        disabled={disabled || isCurrent}
        className={`w-full py-3 rounded-full font-label-md text-label-md uppercase tracking-wider transition-all disabled:opacity-50 ${
          isCurrent
            ? "bg-surface-container border border-white/10 text-on-surface-variant"
            : "bg-gradient-to-r from-primary-container to-secondary-container text-white hover:opacity-90 hover:shadow-[0_0_15px_rgba(255,107,0,0.4)]"
        }`}
      >
        {isCurrent ? "Plano atual" : info.cta}
      </button>
    </article>
  );
}
