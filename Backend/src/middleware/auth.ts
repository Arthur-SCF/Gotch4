import { jwk } from "hono/jwk";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL!;
const REALM = process.env.KEYCLOAK_REALM!;

/**
 * JWT auth middleware using Keycloak JWKS.
 * alg is explicitly set to RS256 to prevent algorithm confusion attacks
 * (CVE-2026-22817 / CVE-2026-22818 — fixed in hono >= 4.11.4).
 * Applied only to /api/* routes — victim-facing capture routes stay public.
 */
export const requireAuth = jwk({
  jwks_uri: `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/certs`,
  alg: ["RS256"],
});
