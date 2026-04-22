import * as React from "react";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UnreadProvider } from "@/contexts/UnreadContext";
import { userManager } from "@/lib/auth";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    // Skip auth check on OIDC callback routes
    if (location.pathname.startsWith("/auth/")) return;
    const user = await userManager.getUser();
    if (!user || user.expired) {
      await userManager.signinRedirect();
    }
  },
  component: RootComponent,
});

function RootComponent() {
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
