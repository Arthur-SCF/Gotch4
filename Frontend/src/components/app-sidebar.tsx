import * as React from "react";
import {
  IconBriefcase,
  IconDashboard,
  IconFolder,
  IconHelp,
  IconInnerShadowTop,
  IconRadar,
  IconSettings,
  IconTransform,
  IconArchive,
  IconWorld,
  IconAnchor,
  IconCode,
  IconTool,
} from "@tabler/icons-react";

import { NavDocuments } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeSelector } from "@/components/ThemeSelector";
import { DnsStatusIndicator } from "@/components/DnsStatusIndicator";
import { useUnread } from "@/contexts/UnreadContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navMain = [
  { title: "Dashboard", url: "", icon: IconDashboard },
  { title: "Programs",  url: "programs",  icon: IconBriefcase },
  { title: "Files",     url: "files",     icon: IconFolder },
];

const navSecondary = [
  { title: "Settings", url: "/settings", icon: IconSettings },
  { title: "Get Help", url: "#",         icon: IconHelp },
];

const tools = [
  { name: "Payload Library",   url: "/tools/payloads", icon: IconArchive },
  { name: "Encoder / Decoder", url: "/tools/encoder",  icon: IconTransform },
  { name: "Utils",             url: "/tools/utils",    icon: IconTool },
];


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { unread } = useUnread();

  const securityTools = [
    { name: "Events",    url: "/security/events", icon: IconRadar, badge: unread.events || undefined },
    { name: "DNS Tools", url: "/security/dns",    icon: IconWorld },
    { name: "ezXSS",     url: "/security/ezxss",  icon: IconCode,  badge: unread.ez || undefined },
  ];

  const securityToolsMore = [
    { name: "Grab", url: "/security/grab", icon: IconAnchor, badge: unread.grab || undefined },
  ];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="/">
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-semibold">Gotch4</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavDocuments items={securityTools} moreItems={securityToolsMore} label="Security" />
        <NavDocuments items={tools} label="Tools" />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <DnsStatusIndicator />
          <div className="flex-1" />
          <ThemeSelector />
          <ThemeToggle />
        </div>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
