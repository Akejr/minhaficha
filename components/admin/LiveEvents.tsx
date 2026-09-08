"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatCode } from "@/lib/access/format";
import { formatCents } from "@/lib/plans";
import {
  EVENT_FILTERS,
  eventLabel,
  toneClass,
} from "@/lib/admin/event-labels";
import type { AdminEvent } from "@/lib/admin/stats";

/**
 * Live event feed.
 *
 * Polls /api/admin/events every POLL_MS asking only for rows newer than the
 * newest one on screen (cursor on the primary key), so each tick transfers
 * almost nothing when the app is idle.
 *
 * Polling instead of Supabase Realtime is deliberate — see the comment in
 * app/api/admin/events/route.ts: Realtime respects RLS and the events table
 * grants nothing to anon, so a browser subscription would be silent unless we
 * exposed the audit log publicly.
 *
 * Two behaviours that matter in practice:
 *   - polling pauses while the tab is hidden, so leaving the panel open all
 *     day doesn't hammer the database;
 *   - new rows are briefly highlighted, so you can see what just landed
 *     without re-reading the list.
 */

const POLL_MS = 5000;
/** Hard cap on rows kept in memory, so a long session can't grow forever. */
const MAX_ROWS = 500;

export function LiveEvents({
  initialEvents,
  initialFilter = "all",
}: {
  initialEvents: AdminEvent[];
  initialFilter?: string;
}) {
  const [events, setEvents] = useState<AdminEvent[]>(initialEvents);
  const [filter, setFilter] = useState(initialFilter);
  const [live, setLive] = useState(true);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [exhausted, setExhausted] = useState(false);

  // Kept in a ref so the polling effect doesn't restart on every new event.
  const newestId = useRef<number>(initialEvents[0]?.id ?? 0);

  const fetchPage = useCallback(
    async (params: Record<string, string>) => {
      const qs = new URLSearchParams({ filter, ...params });
      const res = await fetch(`/api/admin/events?${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { events: AdminEvent[] };
      return json.events;
    },
    [filter],
  );

  /** Refetch from scratch when the filter changes. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchPage({ limit: "60" });
        if (cancelled) return;
        setEvents(rows);
        setExhausted(rows.length < 60);
        newestId.current = rows[0]?.id ?? 0;
        setNewIds(new Set());
        setError(null);
        setLastSync(new Date());
      } catch {
        if (!cancelled) setError("Não consegui carregar os eventos.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, fetchPage]);

  /** Poll for newer rows. */
  useEffect(() => {
    if (!live) return;

    let stopped = false;

    async function tick() {
      // Don't poll a tab nobody is looking at.
      if (document.visibilityState !== "visible") return;
      try {
        const rows = await fetchPage({
          afterId: String(newestId.current),
          limit: "60",
        });
        if (stopped) return;
        setError(null);
        setLastSync(new Date());
        if (rows.length === 0) return;

        newestId.current = Math.max(newestId.current, rows[0].id);
        setNewIds(new Set(rows.map((r) => r.id)));
        setEvents((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const fresh = rows.filter((r) => !seen.has(r.id));
          return [...fresh, ...prev].slice(0, MAX_ROWS);
        });
        // Clear the highlight after a moment.
        setTimeout(() => {
          if (!stopped) setNewIds(new Set());
        }, 2500);
      } catch {
        if (!stopped) setError("Conexão instável. Tentando de novo...");
      }
    }

    const id = setInterval(tick, POLL_MS);
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [live, fetchPage]);

  async function loadMore() {
    const oldest = events[events.length - 1]?.id;
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage({ beforeId: String(oldest), limit: "60" });
      if (rows.length === 0) {
        setExhausted(true);
      } else {
        setEvents((prev) => [...prev, ...rows]);
        if (rows.length < 60) setExhausted(true);
      }
    } catch {
      setError("Não consegui carregar mais.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          onClick={() => setLive((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-label-md text-[11px] uppercase tracking-wider transition-colors ${
            live
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-white/15 bg-surface-container text-on-surface-variant"
          }`}
          aria-pressed={live}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              live ? "bg-emerald-400 animate-pulse" : "bg-on-surface-variant"
            }`}
          />
          {live ? "Ao vivo" : "Pausado"}
        </button>

        <span className="font-body-md text-[10px] text-on-surface-variant/60">
          {lastSync
            ? `atualizado ${lastSync.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}`
            : "—"}
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
        {EVENT_FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-3 py-1.5 font-label-md text-[11px] transition-colors ${
                active
                  ? "border-primary-container bg-primary-container/15 text-primary-container"
                  : "border-white/10 bg-surface-container text-on-surface-variant hover:border-white/20"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="status" className="mb-2 font-body-md text-[11px] text-error">
          {error}
        </p>
      )}

      {events.length === 0 ? (
        <p className="glass-card rounded-xl p-5 text-center font-body-md text-[13px] text-on-surface-variant">
          Nenhum evento neste filtro ainda.
        </p>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          {events.map((e) => (
            <EventRowView key={e.id} e={e} highlight={newIds.has(e.id)} />
          ))}
        </div>
      )}

      {!exhausted && events.length > 0 && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 w-full rounded-full border border-white/10 bg-surface-container py-3 font-label-md text-[12px] text-on-surface-variant hover:border-white/20 transition-colors disabled:opacity-50"
        >
          {loadingMore ? "Carregando..." : "Carregar mais antigos"}
        </button>
      )}

      {exhausted && events.length > 0 && (
        <p className="mt-3 text-center font-body-md text-[10px] text-on-surface-variant/50">
          Fim do histórico.
        </p>
      )}
    </div>
  );
}

function EventRowView({ e, highlight }: { e: AdminEvent; highlight: boolean }) {
  const meta = eventLabel(e.type);

  return (
    <div
      className={`px-4 py-2.5 border-b border-white/5 last:border-b-0 transition-colors ${
        highlight ? "bg-primary-container/10" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-body-md text-[12px] ${toneClass(meta.tone)}`}>
          {meta.label}
          {e.isFree === true && (
            <span className="ml-1.5 font-label-md text-[9px] uppercase tracking-wider text-emerald-300">
              grátis
            </span>
          )}
        </span>
        <span className="font-mono-data text-[10px] text-on-surface-variant/60 shrink-0">
          {new Date(e.createdAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 font-body-md text-[10px] text-on-surface-variant/70">
        {e.fixtureId && (
          <Link
            href={`/match/${e.fixtureId}`}
            className="text-primary-container/90 hover:opacity-80"
          >
            {e.fixtureLabel ?? `jogo #${e.fixtureId}`}
          </Link>
        )}
        {e.code && <span>{formatCode(e.code)}</span>}
        {e.amountCents != null && <span>{formatCents(e.amountCents)}</span>}
        {e.detail && <span>{e.detail}</span>}
        {e.ipHash && (
          <span className="text-on-surface-variant/40">
            visitante {e.ipHash.slice(0, 6)}
          </span>
        )}
      </div>
    </div>
  );
}
