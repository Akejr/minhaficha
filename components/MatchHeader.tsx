"use client";

import Link from "next/link";
import { useState } from "react";
import type { MatchAnalysis } from "@/lib/mock-analysis";
import { teamLogoUrl } from "@/lib/team-logo";

type Props = {
  analysis: MatchAnalysis;
};

export function MatchHeader({ analysis }: Props) {
  return (
    <section className="glass-card rounded-xl p-6 relative overflow-hidden">
      <div className="flex items-center justify-between mb-5">
        <Link
          href="/"
          className="flex items-center gap-1 text-on-surface-variant hover:text-primary-container transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          <span className="font-label-md text-label-md">Voltar</span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="font-label-md text-label-md text-on-surface-variant px-2 py-1 rounded bg-surface-container border border-white/10">
            {analysis.kickoffLabel}
          </span>
          <span className="font-mono-data text-mono-data text-on-surface-variant">
            {analysis.competition}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 items-center gap-4">
        <TeamSide name={analysis.homeTeam} logo={teamLogoUrl(analysis.homeLogo)} />
        <div className="flex flex-col items-center justify-center">
          <span className="font-headline-md text-[28px] text-on-surface-variant">VS</span>
        </div>
        <TeamSide name={analysis.awayTeam} logo={teamLogoUrl(analysis.awayLogo)} />
      </div>
    </section>
  );
}

function TeamSide({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="flex flex-col items-center text-center">
      <TeamLogo src={logo} alt={name} />
      <span className="font-headline-md text-[16px] text-on-surface mt-2">{name}</span>
    </div>
  );
}

function TeamLogo({ src, alt }: { src?: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className="w-14 h-14 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-on-surface-variant">shield</span>
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
