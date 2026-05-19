/**
 * Convert an API-Football team logo URL into a same-origin proxied URL.
 *
 * API-Football logos look like https://media.api-sports.io/football/teams/127.png
 * That subdomain is sometimes blocked by ad-blockers / DNS filters. Routing
 * through /api/team-logo/:id solves that and lets us cache aggressively.
 */
export function teamLogoUrl(originalUrl?: string | null): string | null {
  if (!originalUrl) return null;
  const match = /\/football\/teams\/(\d+)\.png/.exec(originalUrl);
  if (!match) return originalUrl;
  return `/api/team-logo/${match[1]}`;
}
