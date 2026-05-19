type Props = {
  summary: string;
  confidence: number;
};

export function AISummary({ summary, confidence }: Props) {
  return (
    <section className="glass-card rounded-xl p-6 relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary-container opacity-[0.08] blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-container">
            auto_awesome
          </span>
          <h3 className="font-headline-md text-[18px] text-on-surface">
            Análise da IA
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-label-md text-label-md text-on-surface-variant">
            Confiança
          </span>
          <span className="font-mono-data text-mono-data text-primary-container">
            {confidence}%
          </span>
        </div>
      </div>

      <p className="font-body-md text-body-md text-on-surface-variant relative z-10">
        {summary}
      </p>

      <div className="mt-4 h-1 w-full bg-surface-container rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-container to-secondary-container"
          style={{ width: `${confidence}%` }}
        />
      </div>
    </section>
  );
}
