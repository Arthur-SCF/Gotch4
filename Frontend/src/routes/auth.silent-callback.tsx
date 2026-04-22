import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { userManager } from "@/lib/auth";

export const Route = createFileRoute("/auth/silent-callback")({
  component: SilentCallbackPage,
});

function SilentCallbackPage() {
  useEffect(() => {
    userManager.signinSilentCallback().catch((err) => {
      console.error("Silent renew callback error:", err);
    });
  }, []);

  // Blank page — this runs in a hidden iframe
  return null;
}
