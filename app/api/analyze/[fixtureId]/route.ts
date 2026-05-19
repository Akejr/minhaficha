import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { serviceRoleClient } from "@/lib/supabase/server";
import {
  getOrCreateAnalysis,
  recordUserView,
} from "@/lib/supabase/analysis-cache";
import { effectivePlan, FREE_DAILY_LIMIT } from "@/lib/plans";
import type { Profile } from "@/lib/supabase/types";

/**
 * GET /api/analyze/:fixtureId
 *
 * Pipeline:
 *   1. Identify caller (must be logged in).
 *   2. Load profile to know their plan + expiry.
 *   3. If free: enforce the 2/day limit BEFORE incurring API/OpenAI cost.
 *   4. Get-or-create analysis from the shared cache.
 *   5. Increment daily counter (free users).
 *   6. Log into user_analyses for history.
 *   7. Respond with the analysis. If user is free, the UI is responsible
 *      for blurring out the low/high risk picks.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { fixtureId: string } },
) {
  const fixtureId = Number(params.fixtureId);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: "fixtureId inválido." }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sessão expirada. Entra de novo." },
      { status: 401 },
    );
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const profile = profileRow as Profile | null;
  const plan = effectivePlan(profile);

  // Enforce free-tier daily quota before any expensive call.
  if (plan === "free") {
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await supabase
      .from("daily_usage")
      .select("analyses_count")
      .eq("user_id", user.id)
      .eq("day", today)
      .maybeSingle();
    const used = usage?.analyses_count ?? 0;
    if (used >= FREE_DAILY_LIMIT) {
      return NextResponse.json(
        {
          error: "Limite diário grátis atingido.",
          code: "DAILY_LIMIT",
          limit: FREE_DAILY_LIMIT,
        },
        { status: 402 },
      );
    }
  }

  try {
    const result = await getOrCreateAnalysis(fixtureId);

    if (plan === "free") {
      // Increment usage atomically via RPC. Fails open: any error is logged
      // but we still serve the user — generosity over strict accounting.
      try {
        await serviceRoleClient().rpc("increment_daily_usage", {
          target_user: user.id,
        });
      } catch (err) {
        console.warn("[analyze] increment_daily_usage failed:", err);
      }
    }

    // History log (best effort).
    await recordUserView(user.id, fixtureId, result.payload, result.ai);

    return NextResponse.json({
      payload: result.payload,
      ai: result.ai,
      plan,
      fromCache: result.fromCache,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    console.error(`[analyze] fixture ${fixtureId} failed:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
