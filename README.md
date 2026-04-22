# Gotch4

Gotch4 is a full-stack bug bounty capture platform for collecting and analyzing out-of-band (OOB) signals during security testing.

It provides:

- HTTP webhook capture (arbitrary request logging)
- DNS capture (local server mode or remote VPS callback mode)
- OOB Grab (keyed capture endpoints for exploit chains)
- ezXSS (lightweight built-in minified/subset blind XSS callback collection, with optional screenshot; full ezXSS by @ssl: https://github.com/ssl/ezXSS)
- Real-time live feed over WebSocket
- Program and scope mapping
- Payload and template libraries
- File hosting with optional hit detection
- Multi-channel notifications (Telegram, Discord, Slack, Email)

<img width="1763" height="1186" alt="Screenshot from 2026-04-23 00-36-32" src="https://github.com/user-attachments/assets/43c93977-83de-433e-8ec9-629535a73cc3" />

## Tech Stack

- Runtime: Bun
- Backend: Hono + Prisma + PostgreSQL + MinIO
- Frontend: React 19 + Vite + TanStack Router + TanStack Query + Tailwind
- Auth: Keycloak (OIDC/JWT)
- Optional DNS remote mode: standalone VPS DNS server

## Monorepo Layout

```text
.
├── Backend/            # API server, webhook capture, DNS callback, OOB features
├── Frontend/           # React dashboard
├── VPS-DNS-Server/     # Remote DNS collector (for public VPS deployments)
├── docker-compose.yml  # Production-like full stack (DB + MinIO + Keycloak + app)
└── docker-compose.dev.yml # Local dev infra only (DB + MinIO)
```

## Quick Start (Recommended: Docker)

### 1. Clone and configure

```bash
git clone https://github.com/Arthur-SCF/Gotch4.git
cd Gotch4
cp .env.example .env
```

Edit `.env` and replace all `CHANGE_ME` values.

### 2. Start the full stack

```bash
docker compose up -d --build
```

This starts:

- PostgreSQL
- MinIO
- Keycloak (+ Keycloak DB)
- Backend (serving API + built frontend)

### 3. Bootstrap Keycloak realm and user

```bash
bash keycloak-setup.sh <keycloak-admin-password> <app-user-password> [app-username]
```

Defaults:

- app username: `gotch4`

Examples:

```bash
# Use all defaults
bash keycloak-setup.sh

# Set admin and app user password (username remains gotch4)
bash keycloak-setup.sh MyAdminPass MyAppPass

# Set admin password, app user password, and custom username
bash keycloak-setup.sh MyAdminPass MyAppPass security_tester
```

### 4. Replace Temporary Keycloak Admin (Recommended)

Keycloak treats bootstrap admin access as temporary/recovery access. For a safer setup, create a dedicated permanent admin and remove or disable the bootstrap admin account.

Detailed step-by-step procedure in the Wiki page.

### 5. Open the app

- App: `http://localhost:3000`
- Keycloak: `http://localhost:8080`
- MinIO Console: `http://localhost:9001`

Login with:

- Username: value you passed as third argument (default: `gotch4`)
- Password: value you set when the user was first created. If the user already existed, password remains unchanged.

## Local Development (Without Full Docker App Container)

Use this flow if you want hot reload for backend and frontend.

### 1. Start local infra only

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Start backend

```bash
cd Backend
bun install
bun run dev
```

### 3. Start frontend

```bash
cd Frontend
bun install
bun run dev
```

Frontend dev server runs on `http://localhost:5173`.

Backend API runs on `http://localhost:3000`.

## Core Runtime Endpoints

- Dashboard and API host: `http://localhost:3000`
- WebSocket stream: `ws://localhost:3000/api/ws/events`
- Dynamic webhook path: `/<webhookPath>` (default `webhook`)
- OOB Grab capture: `/grab/:key`
- ezXSS payload: `/ez`
- ezXSS callback: `/ez/c`

## Key Features

### HTTP and DNS Event Capture

- Captures full request metadata (headers, body, method, IP, user agent, referer)
- Supports DNS query logging into unified event pipeline
- Auto program assignment via scope matching

### OOB Grab

- Keyed endpoints (`/grab/:key`) for exploit chains and token leakage testing
- Persistent history in DB + in-memory queue for one-time polling (`once=true`)
- Key-to-program linking for triage context

### ezXSS

- This is a lightweight built-in ezXSS and a minified/subset implementation, not a replacement for the full ezXSS platform.
- For the full experience (advanced payload management, rich dashboard, multi-user support, and more), use the ezXSS repo and the amazing work by @ssl.
- Both tools are fully compatible, and you can run ezXSS alongside this server when you need the full workflow.
- Dynamic JavaScript payload served from `/ez`
- Callback ingestion at `/ez/c`
- Optional screenshot capture and MinIO storage
- Fine-grained collection toggles in settings

### Files and Detection

- Upload and host files at custom URL paths
- Public/private file mode
- Optional `detectHit` to log accesses as events

### Notifications

- Telegram, Discord, Slack, SMTP Email
- Field-level visibility and redaction
- Per-event-type message templates

## Environment Configuration

Main environment values are in root `.env`.

Use `.env.example` as the source of truth and fill all required variables before startup. The compose stack includes a startup validation guard and blocks launch if placeholders remain.

## Notes

- This project is built for authorized security testing only.
- Use only on assets you own or have explicit permission to test.
