/**
 * In-memory webhook path cache.
 * Initialized from DB at startup, updated when the user changes the path in settings.
 * Avoids a DB lookup on every incoming request.
 */
let _webhookPath = 'webhook';

export function getWebhookPath(): string {
  return _webhookPath;
}

export function setWebhookPath(path: string): void {
  // Strip leading/trailing slashes, then remove any character outside the
  // allowlist [a-zA-Z0-9_-]. This is defense-in-depth: the settings API
  // already validates with the same allowlist, but a value loaded from DB
  // at startup (e.g. inserted via direct DB access) could contain dots or
  // slashes that would otherwise create path-traversal routing issues.
  const clean = path.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_-]/g, '');
  _webhookPath = clean || 'webhook';
}
