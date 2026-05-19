import Link from "next/link";
import { fetchPopularFixtures } from "@/lib/api-football/popular";
import { teamLogoUrl } from "@/lib/team-logo";

/**
 * Server component — fetches the next 3 upcoming matches across the top
 * European leagues. Renders a static, cacheable strip; clicking any card
 * goes to /match/[fixtureId] which runs the full IA analysis.
 */
export async function PopularMatchesSection() {
  let fixtures: Awaited<ReturnType<typeof fetchPopularFixtures>> = [];
  try {
    fixtures = await fetchPopularFixtures();
  } catch (err) {
    console.error("[popular]", err);
  }

  return (
    <section className="w-full max-w-5xl mx-auto mt-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-container">
            local_fire_department
          </span>
          Jogos Populares
        </h2>
      </div>

      {fixtures.length === 0 ? (
        <div className="glass-card rounded-xl p-6 text-on-surface-variant font-body-md text-body-md text-center">
          Não foi possível carregar os próximos jogos agora.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-unit">
          {fixtures.map((f) => (
            <PopularCard key={f.fixtureId} fixture={f} />
          ))}
        </div>
      )}
    </section>
  );
}

type CardProps = {
  fixture: Awaited<ReturnType<typeof fetchPopularFixtures>>[number];
};

function PopularCard({ fixture }: CardProps) {
  const dt = new Date(fixture.kickoff);
  const dateLabel = new Intl.DateTimeFormat("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);

  return (
    <Link
      href={`/match/${fixture.fixtureId}`}
      prefetch
      className="glass-card rounded-xl p-5 hover:border-primary/30 transition-colors group cursor-pointer relative overflow-hidden block press"
    >
      <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="material-symbols-outlined text-primary-container">
          arrow_outward
        </span>
      </div>

      <div className="flex justify-between items-center mb-4">
        <span className="font-label-md text-label-md text-on-surface-variant px-2 py-1 rounded bg-surface-container border border-white/10 truncate">
          {dateLabel}
        </span>
        <span className="font-mono-data text-mono-data text-on-surface-variant truncate ml-2">
          {fixture.league}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <TeamRow name={fixture.home.name} logoUrl={fixture.home.logo} />
        <div className="h-px w-full bg-white/5" />
        <TeamRow name={fixture.away.name} logoUrl={fixture.away.logo} />
      </div>
    </Link>
  );
}

function TeamRow({ name, logoUrl }: { name: string; logoUrl: string }) {
  const proxied = teamLogoUrl(logoUrl);
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
      <span className="font-headline-md text-[16px] text-on-surface truncate">
        {name}
      </span>
    </div>
  );
}
