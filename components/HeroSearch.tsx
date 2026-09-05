"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/lib/api-football/search";
import { teamLogoUrl } from "@/lib/team-logo";

const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;

type Status = "idle" | "loading" | "ready" | "empty" | "error";

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_CHARS) {
      setStatus("idle");
      setHits([]);
      return;
    }

    setStatus("loading");
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { hits: SearchHit[] };
        setHits(json.hits);
        setStatus(json.hits.length > 0 ? "ready" : "empty");
        setActiveIndex(-1);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[search]", err);
        setStatus("error");
        setHits([]);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query]);

  // Click outside → close dropdown.
  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  function go(hit: SearchHit) {
    router.push(`/match/${hit.fixtureId}`);
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "ready" && hits.length > 0) {
      go(hits[Math.max(0, activeIndex)]);
    }
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && query.trim().length >= MIN_CHARS;

  return (
    <section className="flex flex-col items-center text-center w-full mb-section-gap pt-12">
      <h1 className="font-display-lg text-display-lg mb-6 tracking-tight leading-tight">
        Qual jogo vamos
        <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-secondary-container">
          analisar hoje?
        </span>
      </h1>

      <p className="font-body-lg text-body-lg text-on-surface-variant mb-10 max-w-lg">
        Digite o nome do time ou do jogo. Nossa IA analisa milhares de dados em
        segundos para entregar as melhores probabilidades.
      </p>

      <div ref={containerRef} className="w-full relative">
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center group"
        >
          <span className="material-symbols-outlined absolute left-6 text-on-surface-variant text-2xl z-10 group-focus-within:text-primary transition-colors">
            search
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKey}
            placeholder="Ex: Flamengo, Palmeiras, Corinthians..."
            className="w-full bg-black border border-white/10 rounded-full py-5 pl-16 pr-[130px] font-body-lg text-body-lg text-on-surface placeholder:text-surface-variant focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all shadow-lg focus:shadow-[0_0_25px_rgba(255,107,0,0.15)]"
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="search-results"
            aria-expanded={showDropdown}
          />
          <button
            type="submit"
            className="absolute right-2 bg-gradient-to-r from-primary-container to-secondary-container text-white font-label-md text-label-md px-6 py-3 rounded-full hover:opacity-90 transition-all hover:shadow-[0_0_15px_rgba(255,107,0,0.4)] flex items-center gap-2 disabled:opacity-50"
            disabled={status === "loading"}
          >
            Analisar
            <span className="material-symbols-outlined text-[18px]">bolt</span>
          </button>
        </form>

        {showDropdown && (
          <SearchDropdown
            status={status}
            hits={hits}
            activeIndex={activeIndex}
            onSelect={go}
            onHover={setActiveIndex}
          />
        )}
      </div>

      <AccuracyCard />
    </section>
  );
}

/**
 * Compact one-line accuracy banner. Lives just below the search bar — meant
 * to inform, not dominate. Uses small colored dots before each percentage
 * for visual rhythm, plus a soft pulse on the leftmost dot to draw the eye.
 *
 * Numbers come from the May 2026 backtest (403 suggestions · 11 leagues).
 */
function AccuracyCard() {
  return (
    <div className="w-full mt-4 flex items-center justify-center gap-2 text-on-surface-variant text-[12px] font-label-md flex-wrap">
      <span className="inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Taxa de acerto auditada:
      </span>
      <span className="text-emerald-300">
        Baixo <span className="font-semibold">74%</span>
      </span>
      <span className="text-on-surface-variant/60">·</span>
      <span className="text-primary-container">
        Médio <span className="font-semibold">46%</span>
      </span>
      <span className="text-on-surface-variant/60">·</span>
      <span className="text-error">
        Alto <span className="font-semibold">24%</span>
      </span>
      <span className="text-on-surface-variant/60">·</span>
      <span className="text-on-surface-variant/80">403 análises</span>
    </div>
  );
}

function SearchDropdown({
  status,
  hits,
  activeIndex,
  onSelect,
  onHover,
}: {
  status: Status;
  hits: SearchHit[];
  activeIndex: number;
  onSelect: (hit: SearchHit) => void;
  onHover: (i: number) => void;
}) {
  return (
    <div
      id="search-results"
      role="listbox"
      className="absolute left-0 right-0 mt-3 z-50 glass-card rounded-xl overflow-hidden text-left shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
    >
      {status === "loading" && (
        <div className="px-5 py-4 flex items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary-container">
            progress_activity
          </span>
          <span className="font-body-md text-body-md">Buscando jogos...</span>
        </div>
      )}

      {status === "empty" && (
        <div className="px-5 py-4 text-on-surface-variant font-body-md text-body-md">
          Nenhum jogo encontrado para esse time.
        </div>
      )}

      {status === "error" && (
        <div className="px-5 py-4 text-error font-body-md text-body-md">
          Não conseguimos buscar agora. Tente de novo em alguns segundos.
        </div>
      )}

      {status === "ready" &&
        hits.map((hit, idx) => (
          <SearchRow
            key={hit.fixtureId}
            hit={hit}
            active={idx === activeIndex}
            onSelect={() => onSelect(hit)}
            onHover={() => onHover(idx)}
          />
        ))}
    </div>
  );
}

function SearchRow({
  hit,
  active,
  onSelect,
  onHover,
}: {
  hit: SearchHit;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const dt = new Date(hit.kickoff);
  const kickoffLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-b-0 transition-colors ${
        active ? "bg-primary-container/10" : "hover:bg-white/5"
      }`}
    >
      <Logo src={teamLogoUrl(hit.home.logo)} alt={hit.home.name} />
      <div className="flex-1 flex flex-col text-left min-w-0">
        <div className="flex items-center gap-2 truncate">
          <span className="font-headline-md text-[15px] text-on-surface truncate">
            {hit.home.name}
          </span>
          <span className="font-mono-data text-[12px] text-on-surface-variant">
            ×
          </span>
          <span className="font-headline-md text-[15px] text-on-surface truncate">
            {hit.away.name}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-label-md text-[11px] text-on-surface-variant truncate">
            {hit.league} · {hit.country}
          </span>
          <span className="font-mono-data text-[11px] text-primary-container">
            {kickoffLabel}
          </span>
        </div>
      </div>
      <Logo src={teamLogoUrl(hit.away.logo)} alt={hit.away.name} />
      <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
        arrow_forward
      </span>
    </button>
  );
}

function Logo({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className="w-9 h-9 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
          shield
        </span>
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-white/95 border border-white/10 flex items-center justify-center shrink-0 p-1">
      {/* Logos come from API-Football's CDN; using a regular <img> avoids the
          need to whitelist their domain in next.config.js. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={28}
        height={28}
        className="w-7 h-7 object-contain"
        loading="lazy"
        onError={() => setErrored(true)}
      />
    </div>
  );
}
