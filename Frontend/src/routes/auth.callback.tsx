import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { userManager } from "@/lib/auth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  // The OIDC authorization code is single-use; React StrictMode invokes this effect
  // twice in dev, so guard it to avoid a second "Code not valid" exchange.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    userManager
      .signinRedirectCallback()
      .then(() => navigate({ to: "/" }))
      .catch((err) => {
        console.error("OIDC callback error:", err);
        navigate({ to: "/" });
      });
  }, [navigate]);

  return <div style={{ padding: "2rem" }}>Completing login…</div>;
}
