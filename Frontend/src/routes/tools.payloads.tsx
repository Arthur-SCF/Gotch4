import { createFileRoute } from "@tanstack/react-router";
import PayloadLibrary from "@/components/PayloadLibrary";

export const Route = createFileRoute("/tools/payloads")({
  component: PayloadsPage,
});

function PayloadsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Payload Library</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Manage and organize your security testing payloads
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4 sm:p-6 min-h-0">
        <PayloadLibrary />
      </div>
    </div>
  );
}
