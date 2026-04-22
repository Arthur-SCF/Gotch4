import { getAccessToken, login } from "./auth";

/**
 * Authenticated fetch wrapper for /api/* calls.
 * Attaches Bearer token from Keycloak session.
 * Redirects to login if token is missing or rejected (401).
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();

  if (!token) {
    await login();
    // login() redirects, so this line is never reached in practice
    throw new Error("Not authenticated");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    await login();
    throw new Error("Session expired");
  }

  return response;
}
