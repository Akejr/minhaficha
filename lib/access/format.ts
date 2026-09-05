/**
 * Isomorphic access-code helpers — safe to import from client components.
 *
 * Kept deliberately separate from lib/access/codes.ts: that module pulls in
 * `node:crypto` and the Supabase service-role client, so importing it from a
 * client component breaks the browser bundle (and would be a security problem
 * besides). Anything the UI needs lives here instead: no Node built-ins, no
 * database, no secrets.
 */

export const CODE_LENGTH = 12;

/** Uppercase and strip anything that isn't a letter or digit. */
export function normalizeCode(raw: string): string {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Format a code for display: ABCD-EFGH-JKMN */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  if (c.length !== CODE_LENGTH) return c;
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}
