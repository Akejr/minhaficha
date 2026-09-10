import type { Bet } from "@/lib/mock-analysis";
import { BetCard } from "./BetCard";

type Props = {
  bets: Bet[];
  /**
   * When true, the picks are shown as teasers only: risk level + probability
   * stay visible, the actual pick and reasoning are blurred behind a paywall.
   * Used for a logged-out visitor reading a free analysis.
   */
  locked?: boolean;
};

/**
 * Renders the risk-level bets (up to three: low / medium / high).
 *
 * A visitor with a valid code (or a subscriber) sees everything. A logged-out
 * visitor on a free fixture still sees the full match analysis, but the
 * suggested bets are locked — that's the conversion hook.
 */
export function BetsSection({ bets, locked = false }: Props) {
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
            locked={locked}
          />
        ))}
      </div>
    </section>
  );
}
