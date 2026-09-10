import Link from "next/link";
import type { PopularFixture } from "@/lib/api-football/popular";
import { teamLogoUrl } from "@/lib/team-logo";

/**
 * One free analysis, as a tappable card.
 *
 * Shared by the ad landing (/start) and the free-analyses page (/gratis) so the
 * two can't drift apart in wording or behaviour.
 */
export function FreeFixtureCard({ fixture }: { fixture: PopularFixture }) {
  return (
    <Link
      href={`/match/${fixture.fixtureId}`}
      // Prefetch MUST stay off. /match/[id] is dynamic, so a prefetch would
      // server-render the whole analysis in the background: it logs a view
      // nobody made and, on a cache miss, spends real API and OpenAI money on
      // a page that was never opened.
      prefetch={false}
      className="glass-card rounded-xl p-5 block hover:border-primary-container/30 transition-colors group press"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <WhenBadge fixture={fixture} />
        <span className="font-mono-data text-mono-data text-on-surface-variant truncate">
          {fixture.league}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <TeamRow
          name={fixture.home.name}
          logo={fixture.home.logo}
          score={fixture.score?.home}
        />
        <div className="h-px w-full bg-white/5" />
        <TeamRow
          name={fixture.away.name}
          logo={fixture.away.logo}
          score={fixture.score?.away}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-2">
        <span className="font-label-md text-label-md text-primary-container group-hover:opacity-80 transition-opacity">
          Ver análise grátis
        </span>
        <span className="material-symbols-outlined text-primary-container text-[18px]">
          arrow_forward
        </span>
      </div>
    </Link>
  );
}

/**
 * Kickoff moment, or the live state.
 *
 * "Encerrado" is still handled even though finished matches are filtered out of
 * the shown set: the fixture list is cached for five minutes, so a match can
 * end and still appear briefly until the next refresh.
 */
function WhenBadge({ fixture }: { fixture: PopularFixture }) {
  if (fixture.state === "finished") {
    return (
      <span className="font-label-md text-label-md px-2 py-1 rounded bg-white/5 border border-white/15 text-on-surface-variant truncate">
        Encerrado
      </span>
    );
  }
  if (fixture.state === "live") {
    return (
      <span className="font-label-md text-label-md px-2 py-1 rounded bg-error/10 border border-error/40 text-error truncate inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
        Ao vivo
      </span>
    );
  }
  return (
    <span className="font-label-md text-label-md px-2 py-1 rounded bg-surface-container border border-white/10 text-on-surface-variant truncate">
      {fixture.whenLabel}
    </span>
  );
}

function TeamRow({
  name,
  logo,
  score,
}: {
  name: string;
  logo: string;
  score?: number;
}) {
  const proxied = teamLogoUrl(logo);
  return (
    <div className="flex items-center gap-3">
      {proxied ? (
        <div className="w-7 h-7 rounded-full bg-white/95 border border-white/10 flex items-center justify-center p-1 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxied}
            alt={name}
            width={20}
            height={20}
            className="w-5 h-5 object-contain"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-on-surface-variant text-[14px]">
            shield
          </span>
        </div>
      )}
      <span className="font-headline-md text-[16px] text-on-surface truncate flex-1">
        {name}
      </span>
      {score != null && (
        <span className="font-mono-data text-[18px] text-on-surface shrink-0">
          {score}
        </span>
      )}
    </div>
  );
}
