# Gotch4 Wiki

Welcome to the official documentation for Gotch4.

Gotch4 is a bug bounty capture server and dashboard that unifies HTTP, DNS, OOB Grab, and blind XSS capture workflows in one platform.

## Who This Is For

- Security researchers
- Bug bounty hunters
- Red team operators
- Engineers running internal security validation labs

## Documentation Map

- [Getting Started](Getting-Started)
- [Configuration](Configuration)
- [Architecture](Architecture)
- [API Reference](API-Reference)
- [Operations and Deployment](Operations-and-Deployment)
- [Security Model](Security-Model)
- [Troubleshooting](Troubleshooting)
- [Contributing](Contributing)

## Quick Links

- Main app: `http://localhost:3000`
- Keycloak: `http://localhost:8080`
- MinIO Console: `http://localhost:9001`
- WebSocket stream: `ws://localhost:3000/api/ws/events`

## High-Level Feature Set

- HTTP request capture through dynamic webhook path
- DNS capture (local DNS mode or VPS callback mode)
- OOB Grab keyed capture pipeline
- ezXSS blind XSS payload + callback ingestion (lightweight built-in minified/subset version)
- Program management and scope matching
- Payload and template libraries
- Notification dispatch to Telegram, Discord, Slack, Email

## ezXSS Scope Note

This app includes a lightweight built-in ezXSS and it is not the full ezXSS experience.

For advanced payload management, richer dashboard capabilities, multi-user workflows, and more, use the ezXSS repo and the amazing work by @ssl.

Both tools are fully compatible, and you can run ezXSS alongside this server.

## Legal and Ethical Use

Use Gotch4 only against systems you are authorized to test.
