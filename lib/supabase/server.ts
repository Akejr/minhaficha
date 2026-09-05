import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-side Supabase client.
 *
 * There is exactly one flavour on purpose. This app has no Supabase Auth —
 * the only credential is a 12-character access code (see lib/access/) — so
 * there is no per-user JWT for RLS to key off. Every table therefore has RLS
 * enabled with no permissive policies (anon gets nothing) and all access runs
 * through the service-role key here.
 *
 * Consequences to respect:
 *   - NEVER import this from a client component. The key grants full database
 *     access and must not reach the browser.
 *   - Authorisation is the application's job, not the database's. Any handler
 *     that reads paid content must first check `getCurrentAccess()`.
 */

let _serviceClient: ReturnType<typeof createClient<Database>> | null = null;

export function serviceRoleClient() {
  if (_serviceClient) return _serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL missing. Add it to .env.local",
    );
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing. Required for all database access.",
    );
  }

  _serviceClient = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}
