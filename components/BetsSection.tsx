import type { Bet } from "@/lib/mock-analysis";
import { BetCard } from "./BetCard";
import type { Plan } from "@/lib/supabase/types";

type Props = {
  bets: Bet[];
  plan: Plan;
};

/**
 * Renders the three risk-level bets. On the free plan we keep MEDIUM fully
 * visible and blur LOW + HIGH with a paywall overlay.
 */
export function BetsSection({ bets, plan }: Props) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-container">
            casino
          </span>
          Apostas Sugeridas
        </h2>
        <span className="font-label-md text-label-md text-on-surface-variant">
          {bets.length} {bets.length === 1 ? "cenário" : "cenários"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {bets.map((bet) => (
          <BetCard
            key={`${bet.riskLevel}-${bet.market}`}
            bet={bet}
            locked={plan === "free" && bet.riskLevel !== "medium"}
          />
        ))}
      </div>
    </section>
  );
}
