import { NextResponse, type NextRequest } from "next/server";
import { normalizeCode, validateCode, touchCode } from "@/lib/access/codes";
import { ACCESS_COOKIE, accessCookieOptions } from "@/lib/access/session";
import { logEvent, maskCode } from "@/lib/analytics/events";

/**
 * POST /api/session  — log in with an access code
 * DELETE /api/session — log out
 *
 * The code is placed in an HttpOnly cookie so client-side JavaScript (and
 * anything injected into the page) can't read it back out. It is re-checked
 * against the database on every request, so there's no signed-token state to
 * keep in sync.
 */

export async function POST(req: NextRequest) {
  let code = "";
  try {
    const body = (await req.json()) as { code?: unknown };
    if (typeof body.code === "string") code = body.code;
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido." },
      { status: 400 },
    );
  }

  const normalized = normalizeCode(code);
  if (!normalized) {
    return NextResponse.json(
      { error: "Digite o seu código de acesso." },
      { status: 400 },
    );
  }

  const access = await validateCode(normalized);
  if (!access) {
    // Log the attempt masked — enough to spot a typo, never enough to reuse.
    await logEvent({
      type: "login_failed",
      ok: false,
      detail: maskCode(normalized),
    });
    // Deliberately vague: don't reveal whether a code exists but expired
    // versus never existed.
    return NextResponse.json(
      { error: "Código inválido ou expirado." },
      { status: 401 },
    );
  }

  void touchCode(access.code);
  await logEvent({
    type: "login_success",
    code: access.code,
    ok: true,
    detail: access.isPermanent ? "vitalício" : `${access.daysLeft} dias`,
  });

  const res = NextResponse.json({
    ok: true,
    isPermanent: access.isPermanent,
    expiresAt: access.expiresAt?.toISOString() ?? null,
    daysLeft: Number.isFinite(access.daysLeft) ? access.daysLeft : null,
  });
  // Store the normalized form so later comparisons are stable.
  res.cookies.set(ACCESS_COOKIE, access.code, accessCookieOptions());
  return res;
}

export async function DELETE() {
  await logEvent({ type: "logout" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, "", {
    ...accessCookieOptions(),
    maxAge: 0,
  });
  return res;
}
