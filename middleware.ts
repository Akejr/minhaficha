import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight routing guards for the access-code model.
 *
 * There is no Supabase Auth token to refresh any more, so the middleware no
 * longer makes a network call — it only looks at whether the access cookie is
 * present. That drops the old ~150-400ms `getUser()` penalty entirely.
 *
 * IMPORTANT: presence of the cookie is NOT proof of a valid code. The cookie
 * is only used here to decide where to send someone. Every page and route
 * that serves paid content re-validates the code against the database via
 * `getCurrentAccess()`. Treating this as authentication would be a hole; it's
 * purely a redirect hint.
 *
 * /match is deliberately NOT guarded: the three free fixtures must stay open
 * to anonymous visitors, and that decision needs the free-fixture list, which
 * lives in the page.
 */

const PROTECTED_PREFIXES = ["/historico"];
const PUBLIC_AUTH_PREFIXES = ["/entrar"];

const ACCESS_COOKIE = "apostai_code";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isPublicAuth = PUBLIC_AUTH_PREFIXES.some((p) => path.startsWith(p));

  if (!isProtected && !isPublicAuth) return NextResponse.next();

  const hasCookie = Boolean(req.cookies.get(ACCESS_COOKIE)?.value);

  if (isProtected && !hasCookie) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/entrar";
    redirectUrl.searchParams.set("returnTo", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (isPublicAuth && hasCookie) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/historico/:path*", "/entrar"],
};
