# Configuration

Gotch4 reads deployment configuration from root `.env` (primarily for Docker-based runs) and from Settings in the UI for runtime behavior.

## Environment File

Use `.env.example` as your baseline:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Purpose |
|---|---|
| `DB_USER`, `DB_PASSWORD` | PostgreSQL credentials |
| `MINIO_USER`, `MINIO_PASSWORD` | MinIO root credentials |
| `KC_DB_PASSWORD` | Keycloak database password |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin bootstrap password |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `KEYCLOAK_ISSUER_URL` | Public issuer URL used in JWT `iss` claim |
| `KEYCLOAK_HOSTNAME` | Public Keycloak host URL for container config |
| `VITE_APP_URL` | Public app URL baked into frontend build |
| `VITE_KEYCLOAK_URL` | Public Keycloak URL baked into frontend build |

Startup is blocked if required values are missing or still `CHANGE_ME`.

## Runtime Settings (UI)

Settings are persisted in the `Settings` table and include:

- DNS config and mode (`local` or `remote`)
- Dynamic webhook path slug
- Notification channels and templates
- Notification field redaction/visibility
- ezXSS collection toggles

## Webhook Path

The capture path is configurable (default: `webhook`).

- Allowed: letters, numbers, `_`, `-`
- Not allowed: reserved route names (for example `api`, `grab`, `ez`)

Changing this updates in-memory state immediately; no server restart is required.

## DNS Modes

### Local Mode

Backend runs a DNS listener directly (port 53).

Use when:

- Your host can bind port 53.
- You can delegate NS records directly.

### Remote Mode

Use `VPS-DNS-Server` on a public VPS and forward captures to:

- `POST /api/dns/callback`

Requires a shared auth token (`dnsAuthToken`) and delegated NS records.

## Notification Configuration

Supported channels:

- Telegram
- Discord
- Slack
- SMTP Email

Sensitive values are masked in API responses.

Two JSON config objects drive message rendering:

- `notifyFieldConfig`: per-field show/redact behavior
- `notifyTemplate`: custom template per event type (`http`, `dns`, `grab`, `ez`)

## ezXSS Collection Controls

Note: this app includes a lightweight built-in ezXSS (minified/subset), not the full ezXSS platform.

If you want the full experience, use the ezXSS repo and the amazing work by @ssl. It is fully compatible and can run alongside this server.

Per-feature toggles:

- DOM capture
- Cookies capture
- localStorage capture
- sessionStorage capture
- Screenshot capture (disabled by default)

Screenshot mode inlines `html2canvas` into payload generation and increases payload size.
