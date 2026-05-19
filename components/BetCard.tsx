import Link from "next/link";
import type { Bet, RiskLevel } from "@/lib/mock-analysis";

type Props = {
  bet: Bet;
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

  return (
    <article
      className={`glass-card rounded-xl p-5 transition-shadow ${meta.glowClass} relative overflow-hidden`}
    >
      {/* Content (blurred when locked) */}
      <div
        className={`${locked ? "blur-md select-none pointer-events-none" : ""}`}
        aria-hidden={locked}
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
      </div>

      {/* Lock overlay */}
      {locked && <LockOverlay riskLabel={meta.label} />}
    </article>
  );
}

function LockOverlay({ riskLabel }: { riskLabel: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-surface-container-lowest/40">
      <div className="w-12 h-12 rounded-full bg-primary-container/20 border border-primary-container/30 flex items-center justify-center mb-3">
        <span className="material-symbols-outlined text-primary-container">
          lock
        </span>
      </div>
      <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface mb-1">
        {riskLabel}
      </p>
      <p className="font-body-md text-[13px] text-on-surface-variant mb-4">
        Disponível com plano pago
      </p>
      <Link
        href="/perfil"
        className="bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-[12px] uppercase tracking-wider px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
      >
        Ver planos
      </Link>
    </div>
  );
}
