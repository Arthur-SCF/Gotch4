import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { userManager, clearLoginLoopGuard } from "@/lib/auth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

// Module-level guard, NOT a component ref. The OIDC authorization code is
// single-use, but React StrictMode unmounts and remounts this component in dev —
// a useRef resets on remount, letting signinRedirectCallback() run twice and
// race on the single-use code (both exchanges can then fail). This flag lives in
// module scope, so it survives the remount; each real callback arrives via a
// full-page redirect from Keycloak, which reloads the module and resets it.
let callbackHandled = false;

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (callbackHandled) return;
    callbackHandled = true;
    userManager
      .signinRedirectCallback()
      .then(() => {
        clearLoginLoopGuard();
        navigate({ to: "/" });
      })
      .catch((err) => {
        console.error("OIDC callback error:", err);
        navigate({ to: "/" });
      });
  }, [navigate]);

  return <div style={{ padding: "2rem" }}>Completing login…</div>;
}
