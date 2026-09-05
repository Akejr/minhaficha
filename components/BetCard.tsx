import type { Bet, RiskLevel } from "@/lib/mock-analysis";

type Props = {
  bet: Bet;
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

export function BetCard({ bet }: Props) {
  const meta = riskMeta[bet.riskLevel];

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
