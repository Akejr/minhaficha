import Link from "next/link";
import {
  fetchPopularFixtures,
  type PopularFixture,
} from "@/lib/api-football/popular";
import { teamLogoUrl } from "@/lib/team-logo";

/**
 * "Análise grátis" — the free tier, rendered as a strip of 3 fixtures.
 *
 * These are the ONLY fixtures anyone can analyse without an access code, and
 * they're free permanently (no daily quota). lib/free-fixtures.ts derives the
 * allow-list from this very same call, so what's shown here and what's
 * actually unlocked can never drift apart.
 *
 * Server component: fetches the next fixtures across our featured leagues
 * (Brazilian football first) and renders a cacheable strip.
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
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-300">
              lock_open_right
            </span>
            Análise grátis
          </h2>
          <p className="font-body-md text-[13px] text-on-surface-variant mt-1">
            Três jogos com a análise completa liberada. Sem código, sem
            cadastro.
          </p>
        </div>
        <span className="shrink-0 mt-1 font-label-md text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
          Grátis
        </span>
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
  return (
    <Link
      href={`/match/${fixture.fixtureId}`}
      // Prefetch MUST stay off here. /match/[id] is a dynamic route, so a
      // prefetch server-renders the whole analysis in the background: it would
      // log a view nobody made, write it into the visitor's history, and on a
      // cache miss spend real API + OpenAI money for a page never opened.
      prefetch={false}
      className="glass-card rounded-xl p-5 hover:border-primary/30 transition-colors group cursor-pointer relative overflow-hidden block press"
    >
      <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="material-symbols-outlined text-primary-container">
          arrow_outward
        </span>
      </div>

      <div className="flex justify-between items-center mb-4 gap-2">
        <StateBadge fixture={fixture} />
        <span className="font-mono-data text-mono-data text-on-surface-variant truncate">
          {fixture.league}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <TeamRow
          name={fixture.home.name}
          logoUrl={fixture.home.logo}
          score={fixture.score?.home}
        />
        <div className="h-px w-full bg-white/5" />
        <TeamRow
          name={fixture.away.name}
          logoUrl={fixture.away.logo}
          score={fixture.score?.away}
        />
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-emerald-300 text-[16px]">
          check_circle
        </span>
        <span className="font-label-md text-[11px] uppercase tracking-wider text-emerald-300">
          {fixture.state === "finished"
            ? "Análise liberada · confira o que saiu"
            : "Análise completa liberada"}
        </span>
      </div>
    </Link>
  );
}

/**
 * Kickoff moment, "Ao vivo" or "Encerrado".
 *
 * "Encerrado" is still handled although finished fixtures are filtered out of
 * the shown set: the list is cached for five minutes, so a match can end and
 * linger briefly until the next refresh.
 */
function StateBadge({ fixture }: { fixture: PopularFixture }) {
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
    <span className="font-label-md text-label-md text-on-surface-variant px-2 py-1 rounded bg-surface-container border border-white/10 truncate">
      {fixture.whenLabel}
    </span>
  );
}

function TeamRow({
  name,
  logoUrl,
  score,
}: {
  name: string;
  logoUrl: string;
  score?: number;
}) {
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
