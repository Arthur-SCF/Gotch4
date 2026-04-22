import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ProgramLinkSelector } from "@/components/ProgramLinkSelector";
import { getMethodColor } from "@/lib/utils/colors";

interface Event {
  id: number;
  method: string;
  path: string;
  fullUrl: string;
  query: string | null;
  headers: string;
  body: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  host: string | null;
  protocol: string | null;
  contentType: string | null;
  contentLength: number | null;
  cookies: string | null;
  programId: number | null;
  createdAt: string;
}

interface Program {
  id: number;
  name: string;
}

interface EventDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event | null;
  programs: Program[];
  onLinkProgram?: (eventId: number, programId: number | null) => void;
}

export function EventDetailsDialog({
  open,
  onOpenChange,
  event,
  programs,
  onLinkProgram,
}: EventDetailsDialogProps) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Event Details #{event.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          <div>
            <div className="text-sm font-medium mb-1">Full URL</div>
            <div className="bg-muted p-3 rounded overflow-x-auto max-w-full">
              <code className="text-sm whitespace-nowrap">{event.fullUrl}</code>
            </div>
          </div>

          {onLinkProgram && (
            <ProgramLinkSelector
              programs={programs}
              selectedProgramId={event.programId}
              onProgramChange={(programId) => onLinkProgram(event.id, programId)}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium mb-1">Method</div>
              <Badge className={getMethodColor(event.method)}>{event.method}</Badge>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Protocol</div>
              <div className="text-sm">{event.protocol || "N/A"}</div>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Path</div>
              <code className="text-sm block truncate" title={event.path}>
                {event.path}
              </code>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Host</div>
              <div className="text-sm truncate" title={event.host || "N/A"}>
                {event.host || "N/A"}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">IP Address</div>
              <code className="text-sm block truncate" title={event.ipAddress || "N/A"}>
                {event.ipAddress || "N/A"}
              </code>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Timestamp</div>
              <div className="text-sm">{new Date(event.createdAt).toLocaleString()}</div>
            </div>
          </div>

          {event.query && (
            <div>
              <div className="text-sm font-medium mb-1">Query Parameters</div>
              <div className="bg-muted p-2 rounded overflow-x-auto max-w-full">
                <code className="text-sm whitespace-nowrap">{event.query}</code>
              </div>
            </div>
          )}

          <div>
            <div className="text-sm font-medium mb-1">User Agent</div>
            <div className="bg-muted p-2 rounded overflow-x-auto max-w-full">
              <div className="text-sm whitespace-nowrap">{event.userAgent || "N/A"}</div>
            </div>
          </div>

          {event.referer && (
            <div>
              <div className="text-sm font-medium mb-1">Referer</div>
              <div className="bg-muted p-2 rounded overflow-x-auto max-w-full">
                <code className="text-sm whitespace-nowrap">{event.referer}</code>
              </div>
            </div>
          )}

          {event.contentType && (
            <div>
              <div className="text-sm font-medium mb-1">Content Type</div>
              <code className="text-sm">{event.contentType}</code>
            </div>
          )}

          {event.contentLength !== null && (
            <div>
              <div className="text-sm font-medium mb-1">Content Length</div>
              <div className="text-sm">{event.contentLength} bytes</div>
            </div>
          )}

          {event.cookies && (
            <div>
              <div className="text-sm font-medium mb-1">Cookies</div>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-w-full">
                {event.cookies}
              </pre>
            </div>
          )}

          <div>
            <div className="text-sm font-medium mb-1">Headers</div>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-w-full">
              {JSON.stringify(JSON.parse(event.headers), null, 2)}
            </pre>
          </div>

          {event.body && (
            <div>
              <div className="text-sm font-medium mb-1">Request Body</div>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-w-full">
                {event.body}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
