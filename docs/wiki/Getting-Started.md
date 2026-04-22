# Getting Started

This page gets Gotch4 running from zero.

## Prerequisites

- Docker and Docker Compose
- Bun (for non-container local development)
- Linux/macOS shell tools (`bash`, `curl`)

## Option A: Full Stack with Docker (Recommended)

### 1. Clone and configure

```bash
git clone <your-repo-url>
cd HTTP-DNS-request-server-repo
cp .env.example .env
```

Edit `.env` and replace every `CHANGE_ME` value.

### 2. Start the stack

```bash
docker compose up -d --build
```

This starts PostgreSQL, MinIO, Keycloak, and the backend container (which serves built frontend assets).

### 3. Bootstrap Keycloak realm and user

```bash
bash keycloak-setup.sh <keycloak-admin-password> <app-user-password> [app-username]
```

Defaults:

- admin password: `CHANGE_ME`
- app user password: `gotch4pass`
- app username: `gotch4`

Script behavior on re-run:

- Existing realm/client are skipped.
- Existing user is kept as-is (password is not reset).
- Script prints HTTP status and response body when admin token retrieval fails.

### 4. Replace Temporary Keycloak Admin (Recommended)

Bootstrap admin access should be treated as temporary access in Keycloak.

After initial setup:

1. Create a dedicated permanent admin account.
2. Apply strong password policy and MFA for admin users.
3. Restrict admin console/API exposure where possible.
4. Disable or delete the bootstrap admin account.

For exact click-by-click instructions, use:

- [Keycloak: Replace Temporary Admin (Step-by-Step)](Operations-and-Deployment#keycloak-replace-temporary-admin-step-by-step)

### 5. Access services

- App: `http://localhost:3000`
- Keycloak: `http://localhost:8080`
- MinIO Console: `http://localhost:9001`

## Option B: Local Dev with Hot Reload

Use this for active development on backend/frontend source.

### 1. Start infra dependencies only

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Run backend

```bash
cd Backend
bun install
bun run dev
```

### 3. Run frontend

```bash
cd Frontend
bun install
bun run dev
```

- Backend: `http://localhost:3000`
- Frontend dev UI: `http://localhost:5173`

## Initial Validation Checklist

After startup, verify:

1. You can log in via Keycloak.
2. Events page loads and WebSocket connects.
3. A test request to webhook creates an event.
4. MinIO bucket is reachable and file upload works.

## Useful Commands

### Backend

```bash
cd Backend
bun run dev
bun run build
bun run start
```

### Frontend

```bash
cd Frontend
bun run dev
bun run build
bun run lint
```

### Database (Prisma)

```bash
cd Backend
bunx prisma migrate dev
bunx prisma generate
bunx prisma studio
bunx prisma db seed
```
