/**
 * Pure helpers backing the dashboard's `/api/forja/[...path]` proxy route. Kept out of route.ts
 * (which only wires Next's Request/Response) so they're directly unit-testable, same pattern as
 * `approval.ts`.
 */

import { timingSafeEqual } from 'node:crypto';

/**
 * True when `pathname` is `prefix` itself or a path segment nested under it. Plain
 * `pathname.startsWith(prefix)` is not enough: it also matches an unrelated sibling like
 * `/control-plane/metrics-extra` against the `/control-plane/metrics` prefix, since string
 * prefixing doesn't respect segment boundaries. `isPathWithinRoot` (packages/contracts) isn't
 * reused here — it resolves inputs as filesystem paths via `path.resolve`, which is the wrong
 * semantics for URL path segments (and platform-dependent via `path.sep`); this applies the same
 * boundary principle directly on `/`, which is always the URL path separator.
 */
export function matchesAllowedPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  const boundary = prefix.endsWith('/') ? prefix : `${prefix}/`;
  return pathname.startsWith(boundary);
}

/**
 * Authenticates the *caller of this dashboard route*, not the backend it proxies to.
 * FORJA_API_TOKEN (forwarded as a Bearer header below) is the server's own credential to the
 * backend; without this check, anyone who can reach the deployed dashboard gets that credential
 * applied on their behalf, including approval decisions. Fails closed on both ends: an
 * unconfigured FORJA_DASHBOARD_TOKEN means the route refuses every request rather than allowing
 * all of them, and a present-but-non-matching credential is rejected the same way as a missing one.
 */
export function isCallerAuthorized(request: Request, expectedToken = process.env.FORJA_DASHBOARD_TOKEN): boolean {
  if (expectedToken === undefined || expectedToken.length === 0) return false;
  const header = request.headers.get('x-forja-dashboard-token');
  if (header !== null) return constantTimeEqual(header, expectedToken);
  const cookie = readCookie(request.headers.get('cookie'), 'forja_dashboard_token');
  if (cookie !== undefined) return constantTimeEqual(cookie, expectedToken);
  return false;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (cookieHeader === null) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return part.slice(separator + 1).trim(); }
  }
  return undefined;
}
