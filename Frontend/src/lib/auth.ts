import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL as string;
const REALM = import.meta.env.VITE_KEYCLOAK_REALM as string;
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID as string;
const APP_URL = import.meta.env.VITE_APP_URL as string;

export const userManager = new UserManager({
  authority: `${KEYCLOAK_URL}/realms/${REALM}`,
  client_id: CLIENT_ID,
  redirect_uri: `${APP_URL}/auth/callback`,
  post_logout_redirect_uri: `${APP_URL}/`,
  silent_redirect_uri: `${APP_URL}/auth/silent-callback`,
  response_type: "code",
  scope: "openid profile email",
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
});

export async function getAccessToken(): Promise<string | null> {
  const user = await userManager.getUser();
  if (!user || user.expired) return null;
  return user.access_token;
}

const REDIRECT_TS_KEY = "oidc:lastRedirectAt";
const REDIRECT_COUNT_KEY = "oidc:redirectCount";
const MAX_CONSECUTIVE_REDIRECTS = 3;
const REDIRECT_STALE_MS = 15000;
const REDIRECT_DEBOUNCE_MS = 2000;

export function clearLoginLoopGuard(): void {
  sessionStorage.removeItem(REDIRECT_TS_KEY);
  sessionStorage.removeItem(REDIRECT_COUNT_KEY);
}

export async function login(): Promise<void> {
  const now = Date.now();
  const last = Number(sessionStorage.getItem(REDIRECT_TS_KEY) ?? 0);
  let count = Number(sessionStorage.getItem(REDIRECT_COUNT_KEY) ?? 0);

  if (now - last > REDIRECT_STALE_MS) count = 0; // stale — a fresh attempt
  if (count >= MAX_CONSECUTIVE_REDIRECTS) {
    console.error("[auth] login redirect loop-guard tripped — not redirecting again");
    return;
  }
  if (now - last < REDIRECT_DEBOUNCE_MS) return; // a redirect is already in flight

  sessionStorage.setItem(REDIRECT_TS_KEY, String(now));
  sessionStorage.setItem(REDIRECT_COUNT_KEY, String(count + 1));
  await userManager.signinRedirect();
}

export async function logout(): Promise<void> {
  await userManager.signoutRedirect();
}

export type { User };
