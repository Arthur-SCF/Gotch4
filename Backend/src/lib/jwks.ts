import { createRemoteJWKSet } from "jose";

/**
 * Shared JWKS instance — fetches public keys from Keycloak's JWKS endpoint.
 * Uses the internal Docker URL (KEYCLOAK_URL) for the key fetch, which is
 * reachable from within the container network.
 *
 * KEYCLOAK_ISSUER is the PUBLIC-facing URL that Keycloak embeds in the `iss`
 * claim of issued tokens.  It MUST match KC_HOSTNAME in Keycloak's config.
 * In Docker Compose the two values are different:
 *   KEYCLOAK_URL         = http://keycloak:8080  (internal, for key fetch)
 *   KEYCLOAK_ISSUER_URL  = http://localhost:8080  (public, for iss validation)
 */
export const JWKS = createRemoteJWKSet(
  new URL(
    `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`
  )
);

export const KEYCLOAK_ISSUER = `${process.env.KEYCLOAK_ISSUER_URL ?? process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`;
