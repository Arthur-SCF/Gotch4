/**
 * Scope matching utility.
 *
 * Program scopes are stored as newline-separated patterns, e.g.:
 *   *.eurodns.com
 *   eurodns.com
 *   https://api.eurodns.com
 *   192.168.1.1
 *
 * Supports:
 *   - Exact hostname match         eurodns.com
 *   - Wildcard subdomain           *.eurodns.com  (matches sub.eurodns.com, NOT eurodns.com)
 *   - General glob                 *.example.*
 *   - URL with protocol stripped   https://api.eurodns.com → api.eurodns.com
 */

function extractHostname(pattern: string): string {
  const p = pattern.trim();
  if (p.startsWith("http://") || p.startsWith("https://")) {
    try {
      return new URL(p).hostname;
    } catch {
      return p;
    }
  }
  // Strip path (take everything before the first /)
  return p.split("/")[0];
}

function wildcardMatch(pattern: string, value: string): boolean {
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();

  if (p === v) return true;
  if (!p.includes("*")) return false;

  if (p.startsWith("*.")) {
    // *.example.com matches sub.example.com but NOT example.com itself
    const suffix = p.slice(1); // ".example.com"
    return v.endsWith(suffix) && v.length > suffix.length;
  }

  // General glob: escape regex special chars except *, convert * to .*
  const escaped = p
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(v);
}

/**
 * Returns true if `host` matches any pattern in the program's scope string.
 * @param scope  Newline-separated scope patterns from the Program model.
 * @param host   Incoming hostname to test (e.g. "sub.eurodns.com", "eurodns.com").
 */
export function matchScope(scope: string, host: string): boolean {
  // Strip port if present (e.g. "example.com:8080" → "example.com")
  const cleanHost = host.split(":")[0].toLowerCase().trim();
  if (!cleanHost) return false;

  const patterns = scope
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const pattern of patterns) {
    const patternHost = extractHostname(pattern).toLowerCase();

    if (wildcardMatch(patternHost, cleanHost)) return true;

    // Also try matching the raw pattern directly against the host
    // (handles cases like "*.eurodns.com" written without a protocol)
    if (pattern.includes("*") && wildcardMatch(pattern.toLowerCase(), cleanHost)) return true;
  }

  return false;
}
