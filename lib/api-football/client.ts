import type { ApiResponse } from "./types";

const BASE_URL = "https://v3.football.api-sports.io";

export class ApiFootballError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiFootballError";
  }
}

function getKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new ApiFootballError(
      "API_FOOTBALL_KEY missing. Add it to .env.local.",
      "*",
    );
  }
  return key;
}

/**
 * Generic GET against api-sports.io v3.
 * Server-side only — never import this in a "use client" module.
 */
export async function apiFootballGet<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  init: { revalidate?: number } = {},
): Promise<T[]> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": getKey(),
      Accept: "application/json",
    },
    // Default cache for 60s; live endpoints override this with revalidate: 0.
    next: { revalidate: init.revalidate ?? 60 },
  });

  if (!res.ok) {
    throw new ApiFootballError(
      `HTTP ${res.status} on ${endpoint}`,
      endpoint,
      res.status,
    );
  }

  const json = (await res.json()) as ApiResponse<T[]>;
  if (json.errors && Array.isArray(json.errors) && json.errors.length > 0) {
    throw new ApiFootballError(
      `API errors on ${endpoint}: ${JSON.stringify(json.errors)}`,
      endpoint,
    );
  }
  return json.response;
}
