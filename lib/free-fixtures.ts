import { fetchFreeAccessIds } from "@/lib/api-football/popular";

/**
 * The free tier's access rule.
 *
 * Note this is NOT the same list the home page shows. The strip drops a match
 * once it ends; access keeps it for the rest of the day. See
 * lib/api-football/popular.ts for why — in short, removing a card is a
 * merchandising choice, while locking an analysis someone is reading is a bug.
 *
 * The underlying API call is cached by the Next fetch cache for 5 minutes, so
 * calling this on every gated request is cheap.
 */
export async function freeFixtureIds(): Promise<Set<number>> {
  try {
    return await fetchFreeAccessIds();
  } catch (err) {
    // Fail CLOSED: if we can't tell what's free, don't hand out paid
    // analyses. The visitor sees the blurred picks instead, which is
    // recoverable.
    console.error("[free-fixtures] could not resolve free set:", err);
    return new Set<number>();
  }
}

/** Is this fixture part of today's free set? */
export async function isFreeFixture(fixtureId: number): Promise<boolean> {
  const ids = await freeFixtureIds();
  return ids.has(fixtureId);
}
