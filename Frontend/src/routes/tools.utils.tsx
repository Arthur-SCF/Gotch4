import { createFileRoute } from "@tanstack/react-router";
import UtilsHelper from "@/components/UtilsHelper";

export const Route = createFileRoute("/tools/utils")({
  component: UtilsPage,
});

function UtilsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Utils</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Generate, convert, and manipulate values during testing
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4 sm:p-6 min-h-0">
        <UtilsHelper />
      </div>
    </div>
  );
}
