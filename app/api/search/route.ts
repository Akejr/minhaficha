import { NextResponse, type NextRequest } from "next/server";
import { searchUpcomingFixtures } from "@/lib/api-football/search";

/**
 * GET /api/search?q=<term>
 *
 * Returns the next upcoming fixtures involving any team whose name matches
 * the query. Empty array for queries shorter than 3 characters.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (q.trim().length < 3) {
    return NextResponse.json({ hits: [] });
  }

  try {
    const hits = await searchUpcomingFixtures(q);
    return NextResponse.json({ hits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    console.error(`[search] q="${q}" failed:`, err);
    return NextResponse.json({ error: message, hits: [] }, { status: 500 });
  }
}
