# API Reference

All API routes are served from the backend host (default: `http://localhost:3000`).

Most `/api/*` routes require a valid Keycloak JWT, except DNS callback health/callback paths that use token-based callback auth.

## WebSocket

| Method | Path | Description |
|---|---|---|
| `WS` | `/api/ws/events?token=<jwt>` | Real-time event stream and capture notifications |

## HTTP/DNS Events

Base: `/api/events`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List events (paginated) |
| `GET` | `/:id` | Get one event |
| `DELETE` | `/:id` | Delete one event |
| `DELETE` | `/` | Delete all events |
| `POST` | `/bulk-delete` | Bulk delete by IDs |
| `PUT` | `/:id/program` | Link/unlink event to program |
| `PUT` | `/:id/notes` | Update notes |

## Programs

Base: `/api/programs`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List programs (paginated) |
| `GET` | `/:id` | Program detail with related records |
| `POST` | `/` | Create program |
| `PUT` | `/:id` | Update program |
| `DELETE` | `/:id` | Delete program |
| `PUT` | `/:id/favorite` | Toggle favorite |

## Files

Base: `/api/files`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List files |
| `GET` | `/:id` | File metadata |
| `GET` | `/:id/content` | File text content |
| `POST` | `/` | Create file |
| `PUT` | `/:id` | Update content/path/mimetype |
| `PUT` | `/:id/program` | Link/unlink file to program |
| `PUT` | `/:id/notes` | Update notes |
| `PUT` | `/:id/visibility` | Toggle public/private |
| `PUT` | `/:id/detect` | Toggle `detectHit` |
| `DELETE` | `/:id` | Delete file |
| `POST` | `/download` | Bulk metadata for download workflow |
| `POST` | `/bulk-delete` | Bulk delete by IDs |

Files are served by custom URL path from root catch-all if present in DB.

## Payloads

Base: `/api/payloads`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List payloads with filters |
| `GET` | `/export` | Export payloads/categories |
| `POST` | `/import` | Import payload bundle |
| `GET` | `/:id` | Get payload |
| `POST` | `/` | Create payload |
| `PUT` | `/:id` | Update payload |
| `DELETE` | `/:id` | Delete payload |
| `PUT` | `/:id/favorite` | Toggle favorite |
| `PUT` | `/:id/program` | Link/unlink to program |
| `POST` | `/bulk-delete` | Bulk delete payloads |

## Payload Categories

Base: `/api/payload-categories`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List categories with counts |
| `GET` | `/:id` | Category detail + payloads |
| `POST` | `/` | Create category |
| `PUT` | `/:id` | Update category |
| `DELETE` | `/:id` | Delete category |

## Templates and Config

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/templates` | List templates by category |
| `GET` | `/api/templates/:id` | Get one template |
| `GET` | `/api/config/webhook-url` | Resolve webhook URL/domain info |

## Dynamic Webhook Capture

| Method | Path | Description |
|---|---|---|
| `ANY` | `/<webhookPath>/*` | Capture arbitrary HTTP requests |

Default path is `webhook`, but it is configurable in settings.

## OOB Grab

Capture endpoint:

| Method | Path | Description |
|---|---|---|
| `OPTIONS` | `/grab/:key` | CORS preflight |
| `ANY` | `/grab/:key` | Capture request and return `ok` |

API endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/grab` | All keys + DB-backed entries |
| `GET` | `/api/grab/metas` | Key-to-program mappings |
| `GET` | `/api/grab/:key/meta` | One key meta |
| `PUT` | `/api/grab/:key/meta` | Set/clear key program link |
| `GET` | `/api/grab/:key` | DB history for key |
| `GET` | `/api/grab/:key?once=true` | One-time queue poll |
| `DELETE` | `/api/grab/:key/entries` | Clear key entries |
| `DELETE` | `/api/grab/:key` | Delete key and meta |

## ezXSS

This built-in ezXSS API is a lightweight/minified subset and is not intended to replace the full ezXSS platform.

For advanced payload management, richer dashboard features, multi-user support, and more, use the ezXSS repo and the amazing work by @ssl.

Both tools are compatible and can be used together.

Capture endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/ez` | Serve dynamic payload JS |
| `POST` | `/ez/c` | Receive callback data |
| `OPTIONS` | `/ez`, `/ez/c` | CORS preflight |

API endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ez` | Paginated capture list |
| `GET` | `/api/ez/:id` | Full capture detail |
| `GET` | `/api/ez/:id/screenshot` | Screenshot binary |
| `DELETE` | `/api/ez/:id` | Delete one capture |
| `DELETE` | `/api/ez` | Delete all captures |

## DNS Callback API

Base: `/api/dns`

| Method | Path | Description |
|---|---|---|
| `POST` | `/callback` | Receive DNS hit from VPS server |
| `GET` | `/callback/health` | Callback channel health |

## Settings API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings` | Full settings object (masked secrets) |
| `PUT` | `/api/settings/dns` | Update DNS configuration |
| `POST` | `/api/settings/dns/toggle` | Enable/disable DNS |
| `POST` | `/api/settings/dns/test` | Resolver test |
| `GET` | `/api/settings/dns/status` | DNS runtime status |
| `PUT` | `/api/settings/webhook` | Update webhook path |
| `GET` | `/api/settings/notifications` | Notification settings |
| `PUT` | `/api/settings/notifications` | Update notification settings |
| `POST` | `/api/settings/notifications/test` | Send test notification |
| `GET` | `/api/settings/ez` | ezXSS collection toggles |
| `PUT` | `/api/settings/ez` | Update ezXSS toggles |
