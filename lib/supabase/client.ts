"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Browser-side Supabase client. Use inside Client Components only.
 * Sessions persist via cookies that the server reads on the next request.
 */
let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getBrowserClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase env vars missing on the client.");
  }
  _client = createBrowserClient<Database>(url, anonKey);
  return _client;
}
