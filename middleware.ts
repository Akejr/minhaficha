import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth cookie for protected routes only and bounces
 * unauthenticated users to /entrar with the original path preserved.
 *
 * Performance note: every middleware invocation that calls `getUser()` adds
 * ~150–400ms of latency because it validates the JWT against Supabase. We
 * therefore SHORT-CIRCUIT for public paths and only do the round-trip for
 * the few protected ones.
 */

const PROTECTED_PREFIXES = ["/match", "/historico", "/perfil"];
const PUBLIC_AUTH_PREFIXES = ["/entrar", "/registar"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isPublicAuth = PUBLIC_AUTH_PREFIXES.some((p) => path.startsWith(p));

  // Public, non-auth pages: do nothing — fast path.
  if (!isProtected && !isPublicAuth) {
    return NextResponse.next();
  }

  const res = NextResponse.next({ request: { headers: req.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          req.cookies.set({ name, value, ...options });
          res.cookies.set({ name, value, ...options });
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/entrar";
    redirectUrl.searchParams.set("returnTo", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (isPublicAuth && user) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Run middleware only on routes where it actually matters. Static assets,
     * API routes (except auth-relevant ones), and the home page never require
     * the auth cookie roundtrip.
     */
    "/match/:path*",
    "/historico/:path*",
    "/perfil/:path*",
    "/entrar",
    "/registar",
  ],
};
