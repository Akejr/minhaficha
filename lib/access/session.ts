import { cache } from "react";
import { cookies } from "next/headers";
import { isMasterCode, validateCode, type AccessInfo } from "./codes";

/**
 * Session handling for the access-code model.
 *
 * The "session" is just the code itself, kept in an HttpOnly cookie and
 * re-validated against the database on every request. There is no JWT and
 * no refresh dance — a code is either live or it isn't, so revoking access
 * is as simple as deleting (or expiring) the row.
 *
 * `getCurrentAccess()` is wrapped in React.cache so any number of Server
 * Components can call it during one render and only one database lookup
 * happens.
 */

export const ACCESS_COOKIE = "apostai_code";

/** 30 days — matches the code's own validity window. */
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export function accessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

/**
 * Current access, or null when the visitor has no valid code.
 * Memoised per request.
 */
export const getCurrentAccess = cache(async (): Promise<AccessInfo | null> => {
  try {
    const raw = cookies().get(ACCESS_COOKIE)?.value;
    if (!raw) return null;
    return await validateCode(raw);
  } catch {
    return null;
  }
});

/** Convenience boolean for gating UI. */
export async function hasAccess(): Promise<boolean> {
  return (await getCurrentAccess()) !== null;
}

/**
 * Is the current visitor the owner?
 *
 * Deliberately NOT "is the code permanent": lifetime codes sold or granted to
 * customers are permanent too, and they must not reach /admin. Only the code
 * configured in MASTER_ACCESS_CODE counts.
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  const access = await getCurrentAccess();
  if (!access) return false;
  return isMasterCode(access.code);
});
