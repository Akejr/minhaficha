import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/access/session";
import { loadEvents } from "@/lib/admin/stats";
import { EVENT_FILTERS } from "@/lib/admin/event-labels";

/**
 * GET /api/admin/events — feeds the live event screen.
 *
 * Query params:
 *   filter   preset id from EVENT_FILTERS (default "all")
 *   afterId  return only events newer than this id (used by the poller)
 *   beforeId return only events older than this id (used by "carregar mais")
 *   limit    1..200, default 60
 *
 * Why polling instead of Supabase Realtime: Realtime honours RLS, and the
 * `events` table intentionally has no policies for anon — so a browser
 * subscription would receive nothing. Opening it up would expose the whole
 * audit log to anyone holding the public anon key. Polling through this route
 * keeps the service-role key server-side and the owner check enforced.
 *
 * Owner only; anyone else gets 404 so the route isn't confirmed to exist.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const filterId = sp.get("filter") ?? "all";
  const preset = EVENT_FILTERS.find((f) => f.id === filterId);

  const parseId = (raw: string | null): number | undefined => {
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
  };

  const events = await loadEvents({
    types: preset?.types.length ? preset.types : undefined,
    afterId: parseId(sp.get("afterId")),
    beforeId: parseId(sp.get("beforeId")),
    limit: parseId(sp.get("limit")) ?? 60,
  });

  return NextResponse.json(
    { events, serverTime: new Date().toISOString() },
    // Operational data polled every few seconds — never cache it.
    { headers: { "Cache-Control": "no-store" } },
  );
}
