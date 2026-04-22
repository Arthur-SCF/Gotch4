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

export async function login(): Promise<void> {
  await userManager.signinRedirect();
}

export async function logout(): Promise<void> {
  await userManager.signoutRedirect();
}

export type { User };
