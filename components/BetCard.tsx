import Link from "next/link";
import type { Bet, RiskLevel } from "@/lib/mock-analysis";

type Props = {
  bet: Bet;
  /** When true, hide the pick/rationale behind a blur and a paywall note. */
  locked?: boolean;
};

const riskMeta: Record<
  RiskLevel,
  { label: string; badgeClass: string; barClass: string; glowClass: string }
> = {
  low: {
    label: "Baixo Risco",
    badgeClass: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    barClass: "bg-emerald-400",
    glowClass: "hover:shadow-[0_0_20px_rgba(16,185,129,0.18)]",
  },
  medium: {
    label: "Médio Risco",
    badgeClass:
      "text-primary-container bg-primary-container/10 border-primary-container/30",
    barClass: "bg-primary-container",
    glowClass: "hover:shadow-[0_0_20px_rgba(255,107,0,0.25)]",
  },
  high: {
    label: "Alto Risco",
    badgeClass: "text-error bg-error/10 border-error/30",
    barClass: "bg-error",
    glowClass: "hover:shadow-[0_0_20px_rgba(255,180,171,0.18)]",
  },
};

export function BetCard({ bet, locked = false }: Props) {
  const meta = riskMeta[bet.riskLevel];

  // Locked: the risk level and probability stay visible (they're the teaser),
  // while the actual pick and reasoning are blurred with a paywall overlay.
  if (locked) {
    return (
      <article
        className={`glass-card rounded-xl p-5 relative overflow-hidden ${meta.glowClass}`}
      >
        {/* Visible teaser: badge + probability. */}
        <div className="flex items-center justify-between mb-4">
          <span
            className={`font-label-md text-label-md uppercase tracking-wider px-2 py-1 rounded border ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
          <span className="font-mono-data text-mono-data text-on-surface">
            {bet.probability}%
          </span>
        </div>

        {/* Everything below is blurred and unselectable. aria-hidden so a
            screen reader doesn't read out a pick we're deliberately hiding. */}
        <div
          className="blur-[6px] select-none pointer-events-none"
          aria-hidden="true"
        >
          <div className="mb-4">
            <p className="font-label-md text-[12px] text-on-surface-variant uppercase tracking-wider mb-1">
              Mercado sugerido
            </p>
            <p className="font-headline-md text-[18px] text-on-surface">
              Palpite disponível no plano
            </p>
          </div>
          <p className="font-body-md text-[14px] text-on-surface-variant leading-relaxed">
            A explicação completa desta sugestão, com o raciocínio por trás da
            escolha, fica liberada para assinantes do ApostAI.
          </p>
        </div>

        {/* Lock overlay over the blurred region. */}
        <div className="absolute inset-x-0 bottom-0 top-[64px] flex flex-col items-center justify-center gap-1.5 text-center px-4">
          <span className="material-symbols-outlined text-primary-container text-[22px]">
            lock
          </span>
          <p className="font-label-md text-[11px] uppercase tracking-wider text-on-surface">
            Palpite e análise exclusivos
          </p>
          <p className="font-body-md text-[11px] text-on-surface-variant max-w-[240px]">
            <Link
              href="/perfil"
              className="text-primary-container font-semibold hover:opacity-80 transition-opacity underline underline-offset-2 decoration-primary-container/40"
            >
              Assine
            </Link>{" "}
            para ver qual é a aposta e o porquê.
          </p>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`glass-card rounded-xl p-5 transition-shadow ${meta.glowClass} relative overflow-hidden`}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className={`font-label-md text-label-md uppercase tracking-wider px-2 py-1 rounded border ${meta.badgeClass}`}
        >
          {meta.label}
        </span>
        <span className="font-mono-data text-mono-data text-on-surface">
          {bet.probability}%
        </span>
      </div>

      <div className="mb-4">
        <p className="font-label-md text-[12px] text-on-surface-variant uppercase tracking-wider mb-1">
          {bet.market}
        </p>
        <p className="font-headline-md text-[18px] text-on-surface">
          {bet.pick}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
          <div
            className={`h-full ${meta.barClass}`}
            style={{ width: `${bet.probability}%` }}
          />
        </div>
      </div>

      <p className="font-body-md text-[14px] text-on-surface-variant leading-relaxed">
        {bet.rationale}
      </p>
    </article>
  );
}
