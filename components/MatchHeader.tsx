"use client";

import Link from "next/link";
import { useState } from "react";
import type { MatchAnalysis } from "@/lib/mock-analysis";
import { teamLogoUrl } from "@/lib/team-logo";

type Props = {
  analysis: MatchAnalysis;
};

/**
 * Match hero card. Layout, top to bottom:
 *
 *   1) "Voltar" link (acts as a back arrow)
 *   2) Meta strip — kickoff date pill + truncated league name
 *   3) Teams row — logo + name, "VS" in the middle
 *
 * Splitting (1) and (2) on different rows prevents the long competition
 * names ("UEFA Champions League", "Conmebol Libertadores", ...) from
 * shoving the date pill and forcing it to wrap awkwardly.
 */
export function MatchHeader({ analysis }: Props) {
  return (
    <section className="glass-card rounded-xl p-5 relative overflow-hidden">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-on-surface-variant hover:text-primary-container transition-colors mb-3"
      >
        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        <span className="font-label-md text-label-md">Voltar</span>
      </Link>

      <div className="flex items-center justify-between gap-3 mb-5">
        <span className="font-label-md text-label-md text-on-surface-variant px-2.5 py-1 rounded-full bg-surface-container border border-white/10 whitespace-nowrap">
          {analysis.kickoffLabel}
        </span>
        <span className="font-mono-data text-mono-data text-on-surface-variant truncate min-w-0 text-right">
          {analysis.competition}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamSide name={analysis.homeTeam} logo={teamLogoUrl(analysis.homeLogo)} />
        <span className="font-headline-md text-[24px] text-on-surface-variant px-2">
          VS
        </span>
        <TeamSide name={analysis.awayTeam} logo={teamLogoUrl(analysis.awayLogo)} />
      </div>
    </section>
  );
}

function TeamSide({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="flex flex-col items-center text-center min-w-0">
      <TeamLogo src={logo} alt={name} />
      <span className="font-headline-md text-[15px] leading-tight text-on-surface mt-2 break-words hyphens-auto">
        {name}
      </span>
    </div>
  );
}

function TeamLogo({ src, alt }: { src?: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className="w-14 h-14 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-on-surface-variant">
          shield
        </span>
      </div>
    );
  }

  return (
    <div className="w-14 h-14 rounded-full bg-white/95 border border-white/10 flex items-center justify-center p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={40}
        height={40}
        className="w-10 h-10 object-contain"
        loading="lazy"
        onError={() => setErrored(true)}
      />
    </div>
  );
}
