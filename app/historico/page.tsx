import Link from "next/link";
import { redirect } from "next/navigation";
import { TopAppBar } from "@/components/TopAppBar";
import { BottomNavBar } from "@/components/BottomNavBar";
import { serviceRoleClient } from "@/lib/supabase/server";
import { getCurrentAccess } from "@/lib/access/session";
import { teamLogoUrl } from "@/lib/team-logo";
import type { CodeAnalysisRow } from "@/lib/supabase/types";

type Snapshot = {
  league: string;
  kickoff: string;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  summary: string;
  bets: { riskLevel: "low" | "medium" | "high"; marketLabel: string; probability: number }[];
};

export default async function HistoryPage() {
  // History belongs to a code, so it needs one.
  const access = await getCurrentAccess();
  if (!access) redirect("/entrar?returnTo=/historico");

  const supabase = serviceRoleClient();
  const { data: rows } = await supabase
    .from("code_analyses")
    .select("*")
    .eq("code", access.code)
    .order("viewed_at", { ascending: false })
    .limit(60);

  const list = dedupeByFixture((rows ?? []) as CodeAnalysisRow[]).slice(0, 30);

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary-container opacity-[0.02] blur-[100px] pointer-events-none z-0" />

      <TopAppBar />

      <main className="main-shell px-container-margin max-w-[440px] mx-auto relative z-10 bg-grid-pattern min-h-screen anim-page-in">
        <header className="mb-6">
          <h1 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container">
              history
            </span>
            Histórico
          </h1>
          <p className="font-body-md text-[13px] text-on-surface-variant mt-1">
            {list.length} {list.length === 1 ? "análise salva" : "análises salvas"}
          </p>
        </header>

        {list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((row) => {
              const snap = row.snapshot as Snapshot;
              return (
                <HistoryRow
                  key={row.id}
                  fixtureId={row.fixture_id}
                  snap={snap}
                  viewedAt={row.viewed_at}
                />
              );
            })}
          </div>
        )}
      </main>

      <BottomNavBar />
    </>
  );
}

function dedupeByFixture(rows: CodeAnalysisRow[]): CodeAnalysisRow[] {
  const seen = new Set<number>();
  const out: CodeAnalysisRow[] = [];
  for (const r of rows) {
    if (seen.has(r.fixture_id)) continue;
    seen.add(r.fixture_id);
    out.push(r);
  }
  return out;
}

function EmptyState() {
  return (
    <div className="glass-card rounded-2xl p-8 text-center">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-primary-container/10 border border-primary-container/30 flex items-center justify-center">
        <span className="material-symbols-outlined text-primary-container text-[28px]">
          search
        </span>
      </div>
      <p className="font-headline-md text-[16px] text-on-surface mb-1">
        Ainda sem histórico
      </p>
      <p className="font-body-md text-[13px] text-on-surface-variant mb-5">
        Cada jogo que você analisar aparece aqui automaticamente.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md px-5 py-2.5 rounded-full hover:opacity-90 transition-all"
      >
        Buscar um jogo
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </Link>
    </div>
  );
}

function HistoryRow({
  fixtureId,
  snap,
  viewedAt,
}: {
  fixtureId: number;
  snap: Snapshot;
  viewedAt: string;
}) {
  const kickoffDate = new Date(snap.kickoff);
  const kickoffLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(kickoffDate);

  const viewed = new Date(viewedAt);
  const viewedLabel = relativeTime(viewed);

  const mid = snap.bets?.find((b) => b.riskLevel === "medium");

  return (
    <Link
      href={`/match/${fixtureId}`}
      className="glass-card rounded-2xl p-4 hover:border-primary/30 transition-all group block active:scale-[0.99]"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-label-md text-[11px] uppercase tracking-wider text-on-surface-variant truncate">
          {snap.league}
        </span>
        <span className="font-mono-data text-[11px] text-primary-container">
          {kickoffLabel}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <Logo src={snap.homeLogo} alt={snap.home} />
        <span className="font-headline-md text-[14px] text-on-surface flex-1 truncate">
          {snap.home}
        </span>
        <span className="font-mono-data text-[12px] text-on-surface-variant">vs</span>
        <span className="font-headline-md text-[14px] text-on-surface flex-1 text-right truncate">
          {snap.away}
        </span>
        <Logo src={snap.awayLogo} alt={snap.away} />
      </div>

      {mid && (
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-label-md text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-primary-container/10 border border-primary-container/30 text-primary-container shrink-0">
              Médio
            </span>
            <span className="font-body-md text-[13px] text-on-surface-variant truncate">
              {mid.marketLabel}
            </span>
          </div>
          <span className="font-mono-data text-[12px] text-on-surface shrink-0">
            {Math.round(mid.probability * 100)}%
          </span>
        </div>
      )}

      <p className="text-right mt-2 font-body-md text-[10px] text-on-surface-variant/60">
        Visto {viewedLabel}
      </p>
    </Link>
  );
}

function Logo({ src, alt }: { src?: string; alt: string }) {
  const proxied = teamLogoUrl(src);
  if (!proxied) {
    return (
      <div className="w-7 h-7 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-on-surface-variant text-[14px]">
          shield
        </span>
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-white/95 border border-white/10 flex items-center justify-center p-1 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxied}
        alt={alt}
        width={20}
        height={20}
        className="w-5 h-5 object-contain"
        loading="lazy"
      />
    </div>
  );
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `há ${hrs} ${hrs === 1 ? "hora" : "horas"}`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

// This page reads cookies (auth session), so it must be rendered per-request.
export const dynamic = "force-dynamic";
