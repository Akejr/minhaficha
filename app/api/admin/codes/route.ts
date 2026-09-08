import { NextResponse, type NextRequest } from "next/server";
import {
  CODE_KINDS,
  createAdminCode,
  isCodeKind,
  revokeCode,
} from "@/lib/access/codes";
import { isAdmin } from "@/lib/access/session";
import { logEvent } from "@/lib/analytics/events";

/**
 * POST   /api/admin/codes  — mint a code (monthly / annual / lifetime)
 * DELETE /api/admin/codes  — revoke a code
 *
 * Owner only. The gate is `isAdmin()`, which compares the cookie against
 * MASTER_ACCESS_CODE — NOT "is the code permanent", because lifetime codes
 * handed to customers are permanent too and must never reach this route.
 *
 * Unauthorised callers get 404 rather than 403 so the endpoint's existence
 * isn't confirmed to someone probing.
 */

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  let kind: unknown;
  let note: unknown;
  try {
    const body = (await req.json()) as { kind?: unknown; note?: unknown };
    kind = body.kind;
    note = body.note;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  if (!isCodeKind(kind)) {
    return NextResponse.json(
      { error: "Tipo inválido. Use monthly, annual ou lifetime." },
      { status: 400 },
    );
  }

  try {
    const { code, expiresAt } = await createAdminCode({
      kind,
      note: typeof note === "string" ? note : null,
    });

    await logEvent({
      type: "code_created",
      code,
      ok: true,
      detail: CODE_KINDS[kind].label,
      meta: { kind, note: typeof note === "string" ? note : null },
    });

    return NextResponse.json({ code, kind, expiresAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    console.error("[admin/codes] create failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  let code: unknown;
  try {
    const body = (await req.json()) as { code?: unknown };
    code = body.code;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Código ausente." }, { status: 400 });
  }

  const ok = await revokeCode(code);
  if (!ok) {
    return NextResponse.json(
      { error: "Não foi possível revogar esse código." },
      { status: 500 },
    );
  }

  await logEvent({ type: "code_revoked", code, ok: true });
  return NextResponse.json({ ok: true });
}
