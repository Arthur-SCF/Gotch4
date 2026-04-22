"use client"

import { useState } from "react"
import { useRouterState } from "@tanstack/react-router"
import {
  IconDots,
  IconChevronUp,
  type Icon,
} from "@tabler/icons-react"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

interface NavItem {
  name: string
  url: string
  icon: Icon
  badge?: number
}

function BadgePill({ count }: { count: number }) {
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  )
}

export function NavDocuments({
  items,
  moreItems,
  label = "Tools",
}: {
  items: NavItem[]
  moreItems?: NavItem[]
  label?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Force expansion when the active route is inside moreItems
  const isMoreItemActive = moreItems?.some((item) => pathname.startsWith(item.url)) ?? false
  const showMore = expanded || isMoreItemActive

  // Total unread across all hidden items — shown on the "More" button when collapsed
  const moreBadgeTotal = moreItems?.reduce((sum, item) => sum + (item.badge ?? 0), 0) ?? 0

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.name}>
              <a href={item.url}>
                <item.icon />
                <span>{item.name}</span>
                {item.badge && item.badge > 0 ? <BadgePill count={item.badge} /> : null}
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}

        {moreItems && moreItems.length > 0 && (
          <>
            {showMore && moreItems.map((item) => (
              <SidebarMenuItem key={item.name}>
                <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.name}>
                  <a href={item.url}>
                    <item.icon />
                    <span>{item.name}</span>
                    {item.badge && item.badge > 0 ? <BadgePill count={item.badge} /> : null}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-sidebar-foreground/70"
                onClick={() => setExpanded((v) => !v)}
              >
                {showMore
                  ? <IconChevronUp className="text-sidebar-foreground/70" />
                  : <IconDots className="text-sidebar-foreground/70" />
                }
                <span>{showMore ? "Less" : "More"}</span>
                {!showMore && moreBadgeTotal > 0 ? <BadgePill count={moreBadgeTotal} /> : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
