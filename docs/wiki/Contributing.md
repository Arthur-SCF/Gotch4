# Contributing

Thanks for contributing to Gotch4.

## Recommended Workflow

1. Create a feature branch.
2. Make focused changes.
3. Test backend and frontend locally.
4. Open a pull request with clear context.

## Local Validation Checklist

Before opening PR:

1. Backend starts cleanly.
2. Frontend builds and routes load.
3. Critical flows still work:
   - Event capture
   - WebSocket updates
   - Grab capture and retrieval
   - Built-in ezXSS callback ingest (lightweight/minified subset in this app)
4. Prisma client is regenerated if schema changed.

If your change targets full ezXSS feature depth, use the ezXSS repo and the amazing work by @ssl. This server's built-in ezXSS is intentionally lightweight and compatible with running both together.

## Code Quality Guidance

- Keep API behavior backwards compatible when possible.
- Avoid broad refactors in feature PRs unless explicitly scoped.
- Preserve security checks and validation guards.
- Update docs when behavior, env vars, routes, or UI flow changes.

## Documentation Changes

When adding features, update:

- Root README (high-level user impact)
- Relevant page(s) in `docs/wiki/`
- API reference when endpoints or payload contracts change

## Security Reporting

If your contribution uncovers a potential vulnerability:

- Do not publish exploit details in public issue trackers.
- Coordinate responsible disclosure with repository maintainers.
