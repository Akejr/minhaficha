import type { Stat } from "@/lib/mock-analysis";

type Props = {
  stats: Stat[];
  homeTeam: string;
  awayTeam: string;
};

export function MatchStats({ stats, homeTeam, awayTeam }: Props) {
  return (
    <section className="glass-card rounded-xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="material-symbols-outlined text-primary-container">
          query_stats
        </span>
        <h3 className="font-headline-md text-[18px] text-on-surface">
          Estatísticas-chave
        </h3>
      </div>

      <div className="flex justify-between mb-4">
        <span className="font-label-md text-label-md text-on-surface">
          {homeTeam}
        </span>
        <span className="font-label-md text-label-md text-on-surface-variant">
          {awayTeam}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="font-mono-data text-mono-data text-on-surface">
                {stat.homeValue}
              </span>
              <span className="font-label-md text-[12px] text-on-surface-variant uppercase tracking-wider">
                {stat.label}
              </span>
              <span className="font-mono-data text-mono-data text-on-surface-variant">
                {stat.awayValue}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
