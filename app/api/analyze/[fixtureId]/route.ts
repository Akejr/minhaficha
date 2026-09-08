import { NextResponse, type NextRequest } from "next/server";
import {
  getOrCreateAnalysis,
  recordCodeView,
} from "@/lib/supabase/analysis-cache";
import { getCurrentAccess } from "@/lib/access/session";
import { isFreeFixture } from "@/lib/free-fixtures";
import { logEvent } from "@/lib/analytics/events";

/**
 * GET /api/analyze/:fixtureId
 *
 * Pipeline:
 *   1. Resolve access: a valid code cookie, or the fixture being one of the
 *      three free ones.
 *   2. Refuse with 402 when neither holds — before spending any API/OpenAI
 *      quota.
 *   3. Serve from the shared cache, computing it only on a miss.
 *   4. Log history (code holders only).
 *
 * Access is binary: whoever gets a 200 here receives the complete analysis,
 * all three risk levels included.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { fixtureId: string } },
) {
  const fixtureId = Number(params.fixtureId);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: "fixtureId inválido." }, { status: 400 });
  }

  const [access, free] = await Promise.all([
    getCurrentAccess(),
    isFreeFixture(fixtureId),
  ]);

  if (!access && !free) {
    await logEvent({ type: "analysis_blocked", fixtureId, detail: "api" });
    return NextResponse.json(
      {
        error:
          "Este jogo é para assinantes. Assine ou entre com o seu código de acesso.",
        code: "SUBSCRIPTION_REQUIRED",
      },
      { status: 402 },
    );
  }

  try {
    const result = await getOrCreateAnalysis(fixtureId);

    // History log (best effort, code holders only).
    await recordCodeView(
      access?.code ?? null,
      fixtureId,
      result.payload,
      result.ai,
    );
    await logEvent({
      type: "analysis_view",
      fixtureId,
      code: access?.code ?? null,
      isFree: !access,
      detail: result.fromCache ? "cache · api" : "calculada · api",
    });

    return NextResponse.json({
      payload: result.payload,
      ai: result.ai,
      access: access
        ? {
            isPermanent: access.isPermanent,
            expiresAt: access.expiresAt?.toISOString() ?? null,
          }
        : null,
      free: free && !access,
      fromCache: result.fromCache,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    console.error(`[analyze] fixture ${fixtureId} failed:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
