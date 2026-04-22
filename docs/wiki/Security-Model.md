# Security Model

This page explains the current security controls and operational expectations.

## Authentication and Authorization

- Browser/API access to most `/api/*` routes requires Keycloak JWT.
- WebSocket stream `/api/ws/events` requires token in query string.
- DNS callback endpoint uses shared bearer token authentication (not Keycloak JWT).

## Input Validation and Guardrails

- DNS settings are validated before enabling DNS.
- URL path validation prevents unsafe file route collisions.
- Notification webhook URLs and SMTP host values are validated.
- Callback auth token comparison uses constant-time comparison.

## Sensitive Data Handling

- Secrets in settings responses are masked (`***`).
- Password/token fields are not overwritten when masked sentinel is submitted unchanged.

## CORS Behavior

- `/api/*` uses configured allowed origin list.
- Victim-facing capture routes (`/grab/*`, `/ez`, dynamic webhook path) use permissive CORS to support cross-origin testing scenarios.

## Runtime Safety Controls

- Webhook route is rate-limited.
- Built-in ezXSS callback (lightweight/minified subset implementation) has body size limit and rate limiting.
- In-memory grab queue has per-key cap and startup hydration cap.

For the full ezXSS platform experience, use the ezXSS repo and the amazing work by @ssl. It is compatible with this server and can be run alongside it.

## Data Exposure Notes

- Captured content may include sensitive payload data (cookies, headers, DOM).
- Access to dashboard and database should be limited to authorized operators.
- Use private network placement and strong host security controls for persistent deployments.

## Threat Model Boundaries

Gotch4 improves observability and controlled capture workflows but is not a complete security boundary by itself.

Still required in production-like environments:

- Host hardening
- Firewall and network segmentation
- Secret management practices
- Backup encryption and retention policy
- Standard vulnerability management
