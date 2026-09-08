import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/access/session";
import { getPromo, setPromo } from "@/lib/settings";
import { PLAN_PRICE_CENTS } from "@/lib/plans";

/**
 * GET  /api/admin/settings — read the promo switch
 * POST /api/admin/settings — update it
 *
 * Owner only; anyone else gets 404 so the route isn't confirmed to exist.
 */

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }
  return NextResponse.json(await getPromo());
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  let body: { enabled?: unknown; priceCents?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const enabled = body.enabled === true;
  const priceCents =
    typeof body.priceCents === "number" ? Math.round(body.priceCents) : NaN;

  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    return NextResponse.json(
      { error: "Preço promocional inválido." },
      { status: 400 },
    );
  }
  if (priceCents > PLAN_PRICE_CENTS) {
    return NextResponse.json(
      { error: "A promoção não pode custar mais que o preço normal." },
      { status: 400 },
    );
  }

  try {
    await setPromo({ enabled, priceCents });
    return NextResponse.json({ ok: true, enabled, priceCents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    console.error("[admin/settings] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
