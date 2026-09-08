import { serviceRoleClient } from "./server";
import { analyzeFixture } from "@/lib/betting";
import { analyzeWithAI, type AnalysisOutput } from "@/lib/openai/analyze";
import { logEvent } from "@/lib/analytics/events";
import type { AnalysisPayload } from "@/lib/betting";

/**
 * Match-analysis cache backed by Supabase.
 *
 *   getOrCreateAnalysis(fixtureId) → { payload, ai }
 *
 * Lookup order:
 *   1. match_analyses table (cheap, no API/OpenAI cost)
 *   2. otherwise compute fresh: API-Football + Dixon-Coles + OpenAI
 *      and persist for the next caller
 *
 * Cache lifetime is asymmetric:
 *   - For UPCOMING fixtures we keep the row until kickoff + 1h. Past that
 *     point the analysis would still describe the pre-match prediction
 *     correctly, but data drifts (new matches played, injuries...).
 *   - For PAST fixtures we keep the row FOREVER. The pre-match analysis
 *     is now historical and won't change. This is what makes opening a
 *     match from the history page free.
 */

export type CachedAnalysis = {
  payload: AnalysisPayload;
  ai: AnalysisOutput;
  fromCache: boolean;
};

export async function getOrCreateAnalysis(
  fixtureId: number,
): Promise<CachedAnalysis> {
  const sb = serviceRoleClient();

  const { data: cached } = await sb
    .from("match_analyses")
    .select("payload, ai_output, kickoff_at, expires_at")
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  if (cached) {
    const kickoff = new Date(cached.kickoff_at).getTime();
    const expires = new Date(cached.expires_at).getTime();
    const now = Date.now();

    // Past fixture → analysis is permanent, serve regardless of expires_at.
    // Future fixture → respect the expires_at TTL (lets us re-run if needed).
    if (kickoff < now || expires > now) {
      return {
        payload: cached.payload as AnalysisPayload,
        ai: cached.ai_output as AnalysisOutput,
        fromCache: true,
      };
    }
  }

  // Cache miss or stale future-fixture entry — recompute.
  //
  // This is the only branch that spends money (API-Football + OpenAI), so it
  // gets its own event: /admin uses it to separate real cost from free
  // cache hits.
  await logEvent({ type: "analysis_computed", fixtureId });

  const payload = await analyzeFixture(fixtureId);
  const ai = await analyzeWithAI(payload);

  const kickoff = new Date(payload.fixture.kickoff);
  const isPast = kickoff.getTime() < Date.now();
  // Past fixture: stash for ~10 years (effectively forever for our purposes).
  // Future fixture: kickoff + 1h.
  const expires = isPast
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 10)
    : new Date(kickoff.getTime() + 60 * 60 * 1000);

  await sb
    .from("match_analyses")
    .upsert({
      fixture_id: fixtureId,
      payload: payload as unknown as Record<string, unknown>,
      ai_output: ai as unknown as Record<string, unknown>,
      kickoff_at: kickoff.toISOString(),
      computed_at: new Date().toISOString(),
      expires_at: expires.toISOString(),
    });

  return { payload, ai, fromCache: false };
}

/**
 * Best-effort history logging, scoped to an access code. Never throws.
 *
 * Anonymous visitors (the free fixtures) have no code, so nothing is
 * recorded for them — history is a paid-tier feature by construction.
 */
export async function recordCodeView(
  code: string | null,
  fixtureId: number,
  payload: AnalysisPayload,
  ai: AnalysisOutput,
) {
  if (!code) return;
  try {
    const sb = serviceRoleClient();
    const snapshot = {
      league: payload.fixture.league,
      kickoff: payload.fixture.kickoff,
      home: payload.teams.home.name,
      away: payload.teams.away.name,
      homeLogo: payload.teams.home.logo,
      awayLogo: payload.teams.away.logo,
      summary: ai.summary,
      bets: ai.bets,
    };
    await sb.from("code_analyses").insert({
      code,
      fixture_id: fixtureId,
      snapshot: snapshot as unknown as Record<string, unknown>,
    });
  } catch (err) {
    console.warn("[history] failed to log view:", err);
  }
}
