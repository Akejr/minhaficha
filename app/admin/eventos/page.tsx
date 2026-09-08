import { notFound } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/access/session";
import { loadEvents } from "@/lib/admin/stats";
import { EVENT_FILTERS } from "@/lib/admin/event-labels";
import { LiveEvents } from "@/components/admin/LiveEvents";

/**
 * Dedicated event stream.
 *
 * Server-renders the first page so there's content on arrival (no spinner),
 * then hands over to the client component which keeps it fresh by polling.
 */

type PageProps = {
  searchParams: { filter?: string };
};

export default async function AdminEventsPage({ searchParams }: PageProps) {
  if (!(await isAdmin())) notFound();

  const filterId = EVENT_FILTERS.some((f) => f.id === searchParams.filter)
    ? searchParams.filter!
    : "all";
  const preset = EVENT_FILTERS.find((f) => f.id === filterId);

  const initialEvents = await loadEvents({
    types: preset?.types.length ? preset.types : undefined,
    limit: 60,
  });

  return (
    <>
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container opacity-[0.03] blur-[120px] pointer-events-none z-0" />

      <header
        className="fixed left-0 right-0 mx-auto max-w-[440px] z-50 bg-surface-container-lowest/70 backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-6"
        style={{
          top: 0,
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
          paddingBottom: 16,
        }}
      >
        <Link
          href="/admin"
          className="flex items-center gap-1.5 text-on-surface hover:opacity-80 transition-opacity"
        >
          <span className="material-symbols-outlined text-[20px]">
            arrow_back
          </span>
          <span className="font-headline-md text-[17px]">Eventos</span>
        </Link>
        <Link
          href="/admin"
          className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Painel
        </Link>
      </header>

      <main className="px-container-margin max-w-[440px] mx-auto relative z-10 pb-28 pt-[calc(env(safe-area-inset-top,0px)+84px)] anim-page-in">
        <p className="font-body-md text-[12px] text-on-surface-variant mb-4">
          Tudo o que acontece no app, em ordem. A lista se atualiza sozinha a
          cada 5 segundos e pausa quando você troca de aba.
        </p>

        <LiveEvents initialEvents={initialEvents} initialFilter={filterId} />
      </main>
    </>
  );
}

// Live operational data.
export const dynamic = "force-dynamic";
export const revalidate = 0;
