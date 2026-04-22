import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

// Context for drawer width management
const DrawerResizeContext = React.createContext<{
  width: number;
  setWidth: (width: number) => void;
} | null>(null);

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  resizable = false,
  defaultWidth = 40,
  minWidth = 20,
  maxWidth = 90,
  storageKey = "drawer-width",
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  resizable?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}) {
  const [width, setWidth] = React.useState<number>(() => {
    if (!resizable) return defaultWidth;
    const stored = localStorage.getItem(storageKey);
    return stored ? parseFloat(stored) : defaultWidth;
  });

  const contentRef = React.useRef<HTMLDivElement>(null);
  const isResizingRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent Vaul from handling this

    if (!contentRef.current) return;

    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = contentRef.current.offsetWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    // Disable Vaul's drag detection
    if (contentRef.current) {
      contentRef.current.setAttribute('data-vaul-no-drag', 'true');
    }
  };

  React.useEffect(() => {
    if (!resizable) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current || !contentRef.current) return;

      // Calculate the change in pixels
      const deltaX = startXRef.current - e.clientX;
      const newWidthPx = startWidthRef.current + deltaX;

      // Convert to percentage and clamp
      const windowWidth = window.innerWidth;
      const minWidthPx = (windowWidth * minWidth) / 100;
      const maxWidthPx = (windowWidth * maxWidth) / 100;
      const clampedWidthPx = Math.min(Math.max(newWidthPx, minWidthPx), maxWidthPx);
      const widthPercent = (clampedWidthPx / windowWidth) * 100;

      // Apply directly to avoid state update lag
      contentRef.current.style.width = `${widthPercent}%`;
    };

    const handleMouseUp = () => {
      if (!isResizingRef.current) return;

      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      // Re-enable Vaul's drag detection
      if (contentRef.current) {
        contentRef.current.removeAttribute('data-vaul-no-drag');
      }

      // Update state and save to localStorage
      if (contentRef.current) {
        const widthPercent = (contentRef.current.offsetWidth / window.innerWidth) * 100;
        setWidth(widthPercent);
        localStorage.setItem(storageKey, widthPercent.toString());
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizable, minWidth, maxWidth, storageKey]);

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerResizeContext.Provider value={{ width, setWidth }}>
        <DrawerPrimitive.Content
          ref={contentRef}
          data-slot="drawer-content"
          data-vaul-no-drag
          style={resizable ? { width: `${width}%` } : undefined}
          className={cn(
            "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
            "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
            "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
            !resizable && "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:w-2/3 data-[vaul-drawer-direction=right]:lg:w-1/2 data-[vaul-drawer-direction=right]:xl:w-2/5",
            resizable && "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:border-l",
            "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-full data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:w-2/3 data-[vaul-drawer-direction=left]:lg:w-1/2 data-[vaul-drawer-direction=left]:xl:w-2/5",
            className
          )}
          {...props}
        >
          {resizable && (
            <div
              className="absolute left-0 top-0 bottom-0 w-4 -left-2 cursor-col-resize group z-50"
              onMouseDown={handleMouseDown}
              onPointerDown={(e) => {
                e.stopPropagation(); // Stop Vaul from intercepting
              }}
              onTouchStart={(e) => {
                e.stopPropagation(); // Stop Vaul from intercepting touch
              }}
              data-vaul-no-drag // Tell Vaul to ignore this element
              style={{ touchAction: 'none' }} // Disable browser touch handling
            >
              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-border/50 group-hover:bg-primary/60 group-hover:h-8 transition-all rounded-full" />
            </div>
          )}
          <div className="bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
          {children}
        </DrawerPrimitive.Content>
      </DrawerResizeContext.Provider>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
