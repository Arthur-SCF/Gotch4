import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useLocation } from "@tanstack/react-router"

export function SiteHeader() {
  const location = useLocation()

  // Determine page title based on current route
  const getPageTitle = () => {
    const pathname = location.pathname

    // Tools pages
    if (pathname.startsWith('/tools/')) {
      return "Tools"
    }

    // Main pages
    if (pathname === '/' || pathname === '/dashboard') return "Dashboard"
    if (pathname.includes('/programs')) return "Programs"
    if (pathname.includes('/files')) return "Files"
    if (pathname.includes('/security')) return "Security"
    if (pathname.includes('/tools')) return "Tools"
    if (pathname.includes('/settings')) return "Settings"

    // Default fallback
    return "Dashboard"
  }

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-3 sm:px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-1 sm:mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-sm sm:text-base font-medium">{getPageTitle()}</h1>
      </div>
    </header>
  )
}
