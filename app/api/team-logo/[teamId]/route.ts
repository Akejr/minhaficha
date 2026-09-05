import { NextResponse, type NextRequest } from "next/server";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";

/**
 * GET /api/team-logo/:teamId
 *
 * Proxies the API-Football team logo through our origin to bypass DNS-level
 * ad-blockers and to enable aggressive caching.
 *
 * Strategy:
 *   1. Try a normal `fetch()` first — works whenever local DNS resolves the
 *      `media.api-sports.io` host.
 *   2. If that fails (DNS blocked), resolve the host via DNS-over-HTTPS
 *      (Cloudflare 1.1.1.1) and issue the GET via Node's native `https`
 *      module with a custom `lookup` that pins the resolved IP. This keeps
 *      the SNI / Host header pointing at media.api-sports.io so TLS validation
 *      still succeeds against the real certificate.
 */

const HOST = "media.api-sports.io";
const PATH_PREFIX = "/football/teams";

const CACHE_HEADERS = {
  "Cache-Control":
    "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  "Content-Type": "image/png",
} as const;

let resolvedIp: string | null = null;
let resolvedAt = 0;
const DNS_TTL_MS = 60 * 60 * 1000; // 1h

async function resolveOverHttps(host: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=A`,
      { headers: { Accept: "application/dns-json" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { Answer?: { type: number; data: string }[] };
    return json.Answer?.find((r) => r.type === 1)?.data ?? null;
  } catch {
    return null;
  }
}

async function getResolvedIp(): Promise<string | null> {
  if (resolvedIp && Date.now() - resolvedAt < DNS_TTL_MS) return resolvedIp;
  // Try local DNS first; if blocked, fall through to DoH.
  try {
    const local = await dnsLookup(HOST, { family: 4 });
    if (local.address) {
      resolvedIp = local.address;
      resolvedAt = Date.now();
      return resolvedIp;
    }
  } catch {
    // ignored — DNS is blocked, try DoH next.
  }
  resolvedIp = await resolveOverHttps(HOST);
  resolvedAt = Date.now();
  return resolvedIp;
}

/**
 * Issue a GET to https://media.api-sports.io/path/...png while forcing the
 * underlying socket to connect to `pinIp`. The TLS handshake still uses the
 * real hostname (servername), so cert validation succeeds.
 */
function pinnedHttpsGet(
  path: string,
  pinIp: string,
): Promise<{ status: number; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const lookup = (
      _hostname: string,
      options: any,
      cb: any,
    ) => {
      const family = 4;
      // Node may call with options.all === true (expects array) or false (legacy 3-arg).
      if (options && options.all) {
        cb(null, [{ address: pinIp, family }]);
      } else {
        cb(null, pinIp, family);
      }
    };

    const req = https.request(
      {
        method: "GET",
        host: HOST,
        path,
        servername: HOST,
        lookup,
        headers: {
          Accept: "image/png,image/*,*/*",
          "User-Agent": "ApostAI/1.0",
        },
        timeout: 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, buffer: Buffer.concat(chunks) }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function fetchLogo(teamId: number): Promise<{
  ok: boolean;
  body?: Buffer;
  status?: number;
  reason?: string;
}> {
  const path = `${PATH_PREFIX}/${teamId}.png`;
  const url = `https://${HOST}${path}`;

  // 1. Try the platform fetch (works whenever local DNS resolves the host).
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const arr = await res.arrayBuffer();
      return { ok: true, body: Buffer.from(arr), status: res.status };
    }
    if (res.status === 404) {
      return { ok: false, status: 404, reason: "logo not found" };
    }
  } catch {
    // typically: getaddrinfo ENOTFOUND when DNS is blocked
  }

  // 2. Resolve via DoH and pin the connection to the resulting IP.
  const ip = await getResolvedIp();
  if (!ip) return { ok: false, reason: "could not resolve host" };

  try {
    const res = await pinnedHttpsGet(path, ip);
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, body: res.buffer, status: res.status };
    }
    return { ok: false, status: res.status, reason: "upstream non-2xx" };
  } catch (err) {
    return {
      ok: false,
      reason: `pinned https threw: ${(err as Error).message}`,
    };
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { teamId: string } },
) {
  const id = Number(params.teamId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "teamId inválido" }, { status: 400 });
  }

  const result = await fetchLogo(id);
  if (!result.ok || !result.body) {
    console.warn(
      `[team-logo ${id}] failed: ${result.reason ?? "unknown"} (status ${result.status ?? "?"})`,
    );
    return NextResponse.json(
      { error: "logo indisponível" },
      { status: result.status === 404 ? 404 : 502 },
    );
  }

  return new NextResponse(new Uint8Array(result.body), {
    status: 200,
    headers: CACHE_HEADERS,
  });
}
