import { fetchPopularFixtures } from "@/lib/api-football/popular";

/**
 * The free tier.
 *
 * Whatever fixtures the "Análise grátis" section shows on the home page are
 * open to everyone — no code, no login. That's a single source of truth:
 * the section and the access check both read from
 * `fetchPopularFixtures()`, so they can never disagree.
 *
 * Consequence worth knowing: the free set rotates. Once a fixture drops out
 * of the section (because it kicked off), it stops being free. Anyone who
 * already viewed it keeps it in their history.
 *
 * `fetchPopularFixtures` is cached by the Next fetch cache for 5 minutes,
 * so calling this on every gated request is cheap.
 */
export async function freeFixtureIds(): Promise<Set<number>> {
  try {
    const fixtures = await fetchPopularFixtures();
    return new Set(fixtures.map((f) => f.fixtureId));
  } catch (err) {
    // Fail CLOSED: if we can't tell what's free, don't hand out paid
    // analyses. The paywall is shown instead, which is recoverable.
    console.error("[free-fixtures] could not resolve free set:", err);
    return new Set<number>();
  }
}

/** Is this fixture part of the always-free set? */
export async function isFreeFixture(fixtureId: number): Promise<boolean> {
  const ids = await freeFixtureIds();
  return ids.has(fixtureId);
}
