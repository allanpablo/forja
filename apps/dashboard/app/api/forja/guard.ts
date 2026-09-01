/**
 * Pure helpers backing the dashboard's `/api/forja/[...path]` proxy route. Kept out of route.ts
 * (which only wires Next's Request/Response) so they're directly unit-testable, same pattern as
 * `approval.ts`.
 */

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
