import * as React from "react";
import { Outlet, createRootRoute, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UnreadProvider } from "@/contexts/UnreadContext";
import { userManager, login } from "@/lib/auth";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    // Skip auth check on OIDC callback routes
    if (location.pathname.startsWith("/auth/")) return;
    const user = await userManager.getUser();
    if (!user || user.expired) {
      await login();
    }
  },
  component: RootComponent,
});

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // OIDC flow routes (/auth/callback, /auth/silent-callback) MUST render without
  // the app shell. The shell's providers (UnreadProvider, sidebar) fire
  // authenticated API calls; during the callback the user isn't stored yet, so
  // those calls have no token and trigger a login redirect that navigates away
  // mid-exchange. Firefox aborts the in-flight token fetch on that navigation,
  // so the callback never completes → infinite redirect loop. A bare outlet here
  // lets signinRedirectCallback() finish undisturbed.
  if (pathname.startsWith("/auth/")) {
    return <Outlet />;
  }

  return (
    <>
      <TanStackRouterDevtools position="bottom-right" />
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <UnreadProvider>
          <AppSidebar variant="inset" collapsible="icon" />
          <SidebarInset>
            <SiteHeader />
            <Outlet />
          </SidebarInset>
        </UnreadProvider>
      </SidebarProvider>
    </>
  );
}
