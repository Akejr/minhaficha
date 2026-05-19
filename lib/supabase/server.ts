import { cookies } from "next/headers";
import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-side Supabase clients.
 *
 * Two flavours:
 *   - createServerClient(): scoped to the current request's auth cookie.
 *     Use inside Server Components, Route Handlers, Server Actions when
 *     you want operations to run as the logged-in user (RLS enforced).
 *
 *   - serviceRoleClient(): bypasses RLS. Use ONLY for server-only
 *     write operations like populating match_analyses cache or
 *     incrementing daily_usage. Never import from a client component.
 */

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
    );
  }
  return { url, anonKey };
}

export function createServerClient() {
  const { url, anonKey } = getEnv();
  const cookieStore = cookies();
  return createSsrClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll throws inside Server Components — only setting cookies in
          // Route Handlers / Server Actions is supported. Ignored on read.
        }
      },
    },
  });
}
let _serviceClient: ReturnType<typeof createClient<Database>> | null = null;

export function serviceRoleClient() {
  if (_serviceClient) return _serviceClient;
  const { url } = getEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing. Required for server-only write operations.",
    );
  }
  _serviceClient = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}
