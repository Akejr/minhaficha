import type { Bet } from "@/lib/mock-analysis";
import { BetCard } from "./BetCard";

type Props = {
  bets: Bet[];
};

/**
 * Renders the risk-level bets (up to three: low / medium / high).
 *
 * Access is binary in the current model: if the page rendered at all, the
 * visitor is entitled to the whole analysis — either because the fixture is
 * one of the free ones or because they hold a valid access code. So there is
 * no per-card paywall here any more.
 */
export function BetsSection({ bets }: Props) {
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
          <BetCard key={`${bet.riskLevel}-${bet.market}`} bet={bet} />
        ))}
      </div>
    </section>
  );
}
