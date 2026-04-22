import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { userManager } from "@/lib/auth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
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
