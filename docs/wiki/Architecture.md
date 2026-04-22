# Architecture

Gotch4 is a Bun-based monorepo with a backend API server and a React SPA frontend.

## High-Level Components

| Component | Role |
|---|---|
| Backend | Hono API, webhook ingestion, OOB endpoints, static asset serving |
| Frontend | React dashboard for capture analysis and settings |
| PostgreSQL | Persistent storage (events, programs, captures, settings, payloads) |
| MinIO | Object storage for hosted files and ezXSS screenshots |
| Keycloak | Authentication and token issuance |
| VPS-DNS-Server (optional) | Public DNS collector for remote mode |

## Backend Route Topology

Mounted route groups:

- `/api/events`
- `/api/files`
- `/api/programs`
- `/api/payloads`
- `/api/payload-categories`
- `/api/config`
- `/api/templates`
- `/api/grab`
- `/api/ez`
- `/api/dns`
- `/api/settings/*`
- `/grab/*` (capture)
- `/ez` and `/ez/c` (capture)
- `/<webhookPath>/*` dynamic webhook capture

WebSocket endpoint:

- `/api/ws/events`

## Data Flow: HTTP Capture

1. Request arrives at dynamic webhook path.
2. Backend extracts headers/body/meta and stores an `Event` row.
3. Program scope matching optionally sets `programId`.
4. WebSocket broadcast notifies connected clients.
5. Notification fanout runs asynchronously.

## Data Flow: DNS Capture (Remote Mode)

1. DNS query hits public VPS DNS server.
2. VPS forwards query metadata to `/api/dns/callback`.
3. Backend validates callback token and domain.
4. Event row is created with `type=dns`.
5. WebSocket broadcast + notification fanout.

## Data Flow: OOB Grab

1. Victim request hits `/grab/:key`.
2. Capture is saved to DB and pushed to in-memory queue.
3. Dashboard reads persistent history from DB.
4. Exploit scripts poll `/api/grab/:key?once=true` for one-time queue pop.

## Data Flow: ezXSS

This app ships a lightweight built-in ezXSS (minified/subset), not the full standalone ezXSS platform.

For the full experience, use the ezXSS repo and the amazing work by @ssl. It can run alongside this server.

1. Target includes `<script src="/ez"></script>`.
2. Payload executes in victim browser and posts to `/ez/c`.
3. Backend stores callback data and screenshot (if present) to MinIO.
4. Capture is broadcast to frontend and optionally notified.

## Frontend Architecture

- File-based routing (TanStack Router)
- Server state and mutations with TanStack Query
- Global unread badges via context + background WebSocket
- Settings-driven feature toggles and template editing

## Persistence Model

Main Prisma entities:

- `Event`, `Program`, `File`, `Payload`, `PayloadCategory`, `Grab`, `GrabKeyMeta`, `EzCapture`, `Settings`

## Production Serving Model

The backend serves frontend static assets from `Backend/public`.

- `serveStatic` for assets
- SPA fallback to `index.html`
- Dynamic file hosting route resolves DB-backed custom paths
