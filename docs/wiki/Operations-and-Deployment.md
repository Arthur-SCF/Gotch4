# Operations and Deployment

This page covers practical deployment and runbook guidance.

## Deployment Modes

## 1) Single Host with Docker Compose

Use root `docker-compose.yml`.

Pros:

- Fast setup
- All services in one place

Cons:

- Not horizontally scalable by default

## 2) Hybrid with VPS DNS Remote Mode

Use when app is behind tunnel/reverse proxy without public UDP/53.

- Run Gotch4 app stack where convenient (home lab, cloud VM, tunnel)
- Run `VPS-DNS-Server` on a public VPS
- Delegate NS records to VPS
- Forward DNS hit metadata to `/api/dns/callback`

## Operational Checklist

Before production-like use:

1. Replace all placeholder secrets in `.env`.
2. Verify JWT issuer config (`KEYCLOAK_ISSUER_URL`) matches browser-visible issuer.
3. Restrict `CORS_ORIGINS` to expected origins only.
4. Confirm MinIO credentials and bucket initialization.
5. Configure notification channels and test each.

## Backup Strategy

Persist and back up:

- PostgreSQL data (`db_data`)
- MinIO data (`minio_data`)

Suggested cadence:

- Daily snapshots for active use
- Retention based on disclosure/reporting needs

## Logs and Monitoring

Track:

- Backend container logs
- Keycloak logs
- VPS DNS server logs (if remote mode)
- Health checks for callback channel and DNS status endpoints

Recommended checks:

- `/api/settings/dns/status`
- `/api/dns/callback/health`

## Build and Upgrade Workflow

1. Pull latest code.
2. Rebuild container images.
3. Apply Prisma migrations.
4. Confirm startup and authentication.

Typical commands:

```bash
docker compose build --no-cache
docker compose up -d
```

If schema changed:

```bash
cd Backend
bunx prisma migrate deploy
bunx prisma generate
```

## Keycloak Maintenance

Use `keycloak-setup.sh` for initial realm/client/user bootstrap.

Current script usage:

```bash
bash keycloak-setup.sh <keycloak-admin-password> <app-user-password> [app-username]
```

Defaults if omitted:

- admin password: `CHANGE_ME`
- app user password: `gotch4pass`
- app username: `gotch4`

Bootstrap script behavior:

- Idempotent realm/client creation (safe to re-run).
- User creation is idempotent: existing user is detected and not recreated.
- Existing user password is intentionally not updated during re-runs.
- Error output for admin token retrieval includes HTTP status and raw response body.

Client bootstrap uses Keycloak-compatible post-logout redirect configuration through client attributes (`post.logout.redirect.uris`) for newer Keycloak versions.

Important: treat bootstrap admin as temporary access. For long-term operation, create a dedicated permanent admin account with hardened settings (strong password policy, MFA, least-privilege roles), then disable or remove the bootstrap admin account.

## Keycloak: Replace Temporary Admin (Step-by-Step)

This runbook is the exact procedure to replace temporary bootstrap admin access with a permanent hardened admin.

1. Log in to Keycloak Admin Console with the current bootstrap admin.
2. Switch to the `master` realm (top-left realm selector).
3. Create a new permanent admin user:
	- Go to `Users` -> `Create new user`.
	- Use a non-default, non-obvious username.
	- Set `Enabled` to on.
4. Set permanent credentials for the new user:
	- Open the new user -> `Credentials`.
	- Set a strong password and ensure temporary password mode is disabled.
5. Assign admin permissions to the new user:
	- Open user -> `Role mapping` -> `Assign role`.
	- Choose `Client roles` -> `realm-management`.
	- Assign required roles.
	- For full replacement, assign `realm-admin`.
	- For least privilege, assign only specific roles needed by your team.
6. Enforce MFA for admin users:
	- In realm auth settings, require OTP for admin accounts.
	- Complete OTP enrollment on next login for the new admin.
7. Validate the new admin in a separate private/incognito session:
	- Confirm login works.
	- Confirm the account can access admin console areas your team needs.
8. Disable the old bootstrap admin account (do not delete immediately):
	- Open old user -> set `Enabled` to off.
9. Validate operations again with only the new admin account.
10. Delete the old bootstrap admin after successful validation period (or keep disabled per your policy).
11. Remove bootstrap-admin reliance from steady-state runtime:
	- Do not depend on bootstrap admin credentials for daily operations.
	- Keep bootstrap flow only for recovery scenarios.
12. Document recovery access:
	- Keep an internal runbook for emergency admin recovery.
	- Store ownership and recovery process in your secure ops documentation.

Notes:

- Keycloak official guidance treats bootstrap admin as temporary/recovery access.
- If you are in production, also restrict admin console/API exposure and use dedicated hostnames or network controls where possible.

For environment-specific deployments:

- Update redirect URIs and web origins to your real app domains.
- Verify `gotch4-spa` client config after host changes.
