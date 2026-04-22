# Troubleshooting

Common issues and practical fixes.

## Stack Will Not Start (Docker)

Symptom:

- `validate-config` exits with placeholder/missing variable errors.

Fix:

1. Copy `.env.example` to `.env`.
2. Replace all `CHANGE_ME` values.
3. Restart stack.

## 401 Unauthorized on API or WebSocket

Possible causes:

- Missing/invalid JWT.
- Wrong Keycloak issuer config.

Fix:

1. Confirm login is successful.
2. Verify `KEYCLOAK_ISSUER_URL` equals the browser-visible issuer URL.
3. Confirm Keycloak realm/client are configured and active.

## keycloak-setup.sh Fails During Bootstrap

Possible causes:

- Wrong Keycloak admin password passed as first argument.
- Keycloak is not reachable at `http://localhost:8080`.
- Keycloak startup is still in progress when script is run.

Fix:

1. Confirm Keycloak is healthy and accessible.
2. Re-run with correct admin password.
3. Check script output: it now prints HTTP status and response body for token fetch failures.

## keycloak-setup.sh Shows "Password unchanged"

This is expected behavior when the target user already exists.

- The script does not overwrite existing user passwords on re-runs.
- If you need a new password, change it in Keycloak user credentials or delete/recreate the user.

## No DNS Events in Remote Mode

Possible causes:

- NS records not delegated to VPS.
- VPS cannot reach callback URL.
- Callback auth token mismatch.

Fix:

1. Test `/api/dns/callback/health` from VPS.
2. Verify token configured identically on app and VPS.
3. Confirm NS and A records at registrar.

## DNS Local Mode Fails to Start

Possible causes:

- Port 53 is already in use.
- Insufficient privileges to bind privileged port.

Fix:

1. Check process using port 53.
2. Stop conflicting DNS daemon.
3. Use appropriate privileges/capabilities.

## ezXSS Payload Not Executing

Scope note:

- The ezXSS included in this app is a lightweight built-in minified/subset implementation.
- For the full experience, use the ezXSS repo and the amazing work by @ssl.
- Both are compatible and can run together.

Possible causes:

- Browser blocked script due content type mismatch.
- Target CSP blocks external script source.

Fix:

1. Confirm `/ez` returns JavaScript content type.
2. Validate target allows loading script from your host.
3. Check callback endpoint `/ez/c` receives traffic.

## Grab Queue Behavior Is Confusing

Important behavior:

- `/api/grab/:key` returns DB history.
- `/api/grab/:key?once=true` returns and clears in-memory queue only.

If you expect persistent history, use non-`once` endpoint.

## Prisma Model Errors After Schema Changes

Symptom examples:

- Missing model methods on Prisma client.

Fix:

```bash
cd Backend
bunx prisma generate
```

If migrations changed:

```bash
bunx prisma migrate dev
```

## File Serving Route Conflicts

Possible cause:

- Attempting to create file URL paths under reserved prefixes like `/api`, `/grab`, `/ez`.

Fix:

- Use non-reserved custom paths, for example `/assets/poc.js`.
