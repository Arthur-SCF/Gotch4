/**
 * In-memory DNS state cache.
 * Initialized from DB at startup, updated when DNS settings change.
 * Used by the subdomain HTTP detection middleware in index.ts to avoid
 * a DB lookup on every incoming request.
 */

interface DnsState {
  enabled: boolean;
  baseDomain: string | null;
}

let _state: DnsState = { enabled: false, baseDomain: null };

export function getDnsState(): DnsState {
  return _state;
}

export function setDnsState(enabled: boolean, baseDomain: string | null): void {
  _state = { enabled, baseDomain: baseDomain?.toLowerCase() ?? null };
}
