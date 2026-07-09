import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { IconCopy, IconTrash, IconCheck, IconExternalLink, IconNote, IconEdit, IconX, IconWorld, IconWorldWww, IconCode, IconRoute, IconHash } from "@tabler/icons-react";
import { getMethodColor } from "@/lib/utils/colors";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProgramLinkSelector } from "@/components/ProgramLinkSelector";
import { useCopyButton } from "@/hooks/useCopyButton";
import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { cn } from "@/lib/utils";

interface EventPreviewDrawerProps {
  event: any | null;
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  onLinkProgram: (programId: number | null) => void;
  onUpdateNotes: (notes: string) => void;
  programs: any[];
}

type IconComponent = React.ComponentType<{ className?: string }>;

interface CorrelatedEvent {
  readonly id: number;
  readonly type: "http" | "dns" | "ez";
  readonly createdAt: string;
  readonly method?: string | null;
  readonly path?: string | null;
  readonly fullUrl?: string | null;
  readonly dnsQuery?: string | null;
  readonly dnsType?: string | null;
}

const CORRELATION_META: Record<
  CorrelatedEvent["type"],
  { readonly Icon: IconComponent; readonly ring: string; readonly text: string }
> = {
  dns: { Icon: IconWorld, ring: "border-sky-500/30 bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
  http: { Icon: IconWorldWww, ring: "border-emerald-500/30 bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  ez: { Icon: IconCode, ring: "border-violet-500/30 bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
};

function correlatedLabel(item: CorrelatedEvent): string {
  if (item.type === "dns") return `DNS ${item.dnsType ?? ""} ${item.dnsQuery ?? ""}`.trim();
  if (item.type === "ez") return "XSS callback";
  return `HTTP ${item.method ?? ""} ${item.path ?? item.fullUrl ?? ""}`.trim();
}

function MetaField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-xs break-all", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function CorrelationSection({ token, currentId }: { token: string; currentId: number }) {
  const { copy, isCopied } = useCopyButton();
  const { data, isLoading } = useQuery({
    queryKey: ["event-correlation", token],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/events/correlation/${token}`);
      if (!res.ok) throw new Error("Failed to fetch correlation");
      return res.json() as Promise<{ data: CorrelatedEvent[] }>;
    },
    enabled: token.length > 0,
  });

  const linked = data?.data ?? [];

  return (
    <Card className="p-4 border-sky-500/30 bg-sky-500/5">
      <div className="mb-1 flex items-center gap-1.5">
        <IconRoute className="size-4 text-sky-600 dark:text-sky-400" />
        <span className="text-sm font-medium">DNS / SSRF correlation</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        This HTTP hit came from a DNS payload. Every lookup and hit sharing the token, in order.
      </p>
      <button
        type="button"
        aria-label="Copy correlation token"
        onClick={() => copy(token, "corr-token", "correlation token")}
        className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 font-mono text-xs transition-colors hover:bg-muted"
      >
        <IconHash className="size-3 shrink-0 text-muted-foreground" />
        <span className="break-all">{token}</span>
        {isCopied("corr-token") ? (
          <IconCheck className="size-3 shrink-0 text-emerald-500" />
        ) : (
          <IconCopy className="size-3 shrink-0 text-muted-foreground" />
        )}
      </button>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading correlated interactions…</p>
      ) : linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">No other interactions share this token yet.</p>
      ) : (
        <ol className="relative">
          {linked.map((item, idx) => {
            const meta = CORRELATION_META[item.type];
            const StepIcon = meta.Icon;
            const isLast = idx === linked.length - 1;
            const isCurrent = item.type === "http" && item.id === currentId;
            const time = new Date(item.createdAt).toLocaleTimeString();
            return (
              <li key={`${item.type}-${item.id}`} className="relative flex gap-3 pb-4 last:pb-0">
                {!isLast && <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />}
                <span
                  className={cn(
                    "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
                    meta.ring,
                  )}
                >
                  <StepIcon className={cn("size-3.5", meta.text)} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="break-all font-mono text-xs">{correlatedLabel(item)}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{time}</span>
                  </div>
                  <span className={cn("text-[10px] font-medium uppercase tracking-wide", meta.text)}>
                    {item.type}
                    {isCurrent ? " · this request" : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export function EventPreviewDrawer({
  event,
  open,
  onClose,
  onDelete,
  onLinkProgram,
  onUpdateNotes,
  programs,
}: EventPreviewDrawerProps) {
  const isMobile = useIsMobile();
  const { copy, isCopied } = useCopyButton();
  const [notes, setNotes] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  useEffect(() => {
    if (event && open) {
      setNotes(event.notes || "");
      setIsEditingNotes(false);
    }
  }, [event, open]);

  const handleSaveNotes = () => {
    onUpdateNotes(notes);
    setIsEditingNotes(false);
  };

  if (!event) return null;

  const formatHeaders = () => {
    try {
      const headers = typeof event.headers === "string"
        ? JSON.parse(event.headers)
        : event.headers;
      return JSON.stringify(headers, null, 2);
    } catch {
      return event.headers || "{}";
    }
  };

  const formatBody = () => {
    if (!event.body) return "";
    try {
      const parsed = JSON.parse(event.body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return event.body;
    }
  };

  const formatCookies = () => {
    try {
      const cookies = typeof event.cookies === "string"
        ? JSON.parse(event.cookies)
        : event.cookies;
      return JSON.stringify(cookies, null, 2);
    } catch {
      return event.cookies || "{}";
    }
  };

  const formatQueryParams = () => {
    if (!event.query) return "";
    try {
      return JSON.stringify(Object.fromEntries(new URLSearchParams(event.query)), null, 2);
    } catch {
      return String(event.query);
    }
  };

  const generateCurlCommand = () => {
    let curl = `curl -X ${event.method} "${event.fullUrl}"`;

    try {
      const headers = typeof event.headers === "string"
        ? JSON.parse(event.headers)
        : event.headers;
      Object.entries(headers || {}).forEach(([key, value]) => {
        curl += ` \\\n  -H "${key}: ${value}"`;
      });
    } catch {}

    if (event.body) {
      curl += ` \\\n  -d '${event.body}'`;
    }

    return curl;
  };

  const copyCurl = () => {
    const curl = generateCurlCommand();
    copy(curl, "curl", "cURL command");
  };

  const copyUrl = () => {
    copy(event.fullUrl, "url", "URL");
  };

  const copyHeaders = () => {
    copy(formatHeaders(), "headers", "headers");
  };

  const copyBody = () => {
    copy(event.body || "", "body", "body");
  };

  const isJsonContent = (content: string) => {
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <Drawer open={open} onOpenChange={onClose} direction={isMobile ? "bottom" : "right"}>
      <DrawerContent
        className="h-full max-h-[96vh]"
        resizable={!isMobile}
        defaultWidth={50}
        minWidth={30}
        maxWidth={90}
        storageKey="event-preview-drawer-width"
      >
        <DrawerHeader className="gap-1 border-b pb-4">
          <DrawerTitle className="flex items-center gap-2">
            <Badge className={getMethodColor(event.method)}>{event.method}</Badge>
            <span className="truncate font-mono text-sm">{event.path}</span>
          </DrawerTitle>
          <DrawerDescription className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {new Date(event.createdAt).toLocaleString()}
            </span>
            {event.ipAddress && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs font-mono">{event.ipAddress}</span>
              </>
            )}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-hidden px-4 pb-4 flex flex-col gap-4">
          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4">
            <Button size="sm" variant="outline" onClick={copyUrl}>
              {isCopied("url") ? (
                <IconCheck className="size-4 mr-2" />
              ) : (
                <IconCopy className="size-4 mr-2" />
              )}
              Copy URL
            </Button>
            <Button size="sm" variant="outline" onClick={copyCurl}>
              {isCopied("curl") ? (
                <IconCheck className="size-4 mr-2" />
              ) : (
                <IconCopy className="size-4 mr-2" />
              )}
              Copy as cURL
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(event.fullUrl, "_blank")}
            >
              <IconExternalLink className="size-4 mr-2" />
              Open URL
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <IconTrash className="size-4 mr-2" />
              Delete
            </Button>
          </div>

          {/* URL Card */}
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Full URL</div>
            <code className="text-xs sm:text-sm font-mono break-all block">
              {event.fullUrl}
            </code>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Request details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {event.host && <MetaField label="Host" value={event.host} mono />}
              {event.ipAddress && event.ipAddress !== "unknown" && (
                <MetaField label="Source IP" value={event.ipAddress} mono />
              )}
              {event.protocol && <MetaField label="Protocol" value={event.protocol} mono />}
              {event.contentType && <MetaField label="Content-Type" value={event.contentType} mono />}
              {event.contentLength != null && (
                <MetaField label="Content-Length" value={String(event.contentLength)} mono />
              )}
              {event.referer && <MetaField label="Referer" value={event.referer} mono />}
              <MetaField label="Captured" value={new Date(event.createdAt).toLocaleString()} />
            </div>
            {event.userAgent && (
              <div className="mt-3 border-t pt-3">
                <MetaField label="User-Agent" value={event.userAgent} mono />
              </div>
            )}
          </Card>

          {event.correlationToken && (
            <CorrelationSection token={event.correlationToken} currentId={event.id} />
          )}

          {/* Program Link */}
          <ProgramLinkSelector
            programs={programs}
            selectedProgramId={event.programId}
            onProgramChange={onLinkProgram}
          />

          {/* Tabs for Details */}
          <Tabs defaultValue="headers" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="headers">Headers</TabsTrigger>
              <TabsTrigger value="body">Body</TabsTrigger>
              <TabsTrigger value="query">Query</TabsTrigger>
              <TabsTrigger value="cookies">Cookies</TabsTrigger>
              <TabsTrigger value="notes">
                <IconNote className="size-4 mr-1" />
                Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="headers" className="flex-1 overflow-auto mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Request Headers</div>
                <Button size="sm" variant="ghost" onClick={copyHeaders}>
                  {isCopied("headers") ? (
                    <IconCheck className="size-4" />
                  ) : (
                    <IconCopy className="size-4" />
                  )}
                </Button>
              </div>
              <SyntaxHighlighter
                language="json"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                }}
              >
                {formatHeaders()}
              </SyntaxHighlighter>
            </TabsContent>

            <TabsContent value="body" className="flex-1 overflow-auto mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Request Body</div>
                <Button size="sm" variant="ghost" onClick={copyBody}>
                  {isCopied("body") ? (
                    <IconCheck className="size-4" />
                  ) : (
                    <IconCopy className="size-4" />
                  )}
                </Button>
              </div>
              {event.body ? (
                isJsonContent(event.body) ? (
                  <SyntaxHighlighter
                    language="json"
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    {formatBody()}
                  </SyntaxHighlighter>
                ) : (
                  <pre className="text-sm font-mono bg-muted p-4 rounded-md overflow-auto">
                    {event.body}
                  </pre>
                )
              ) : (
                <div className="text-sm text-muted-foreground border rounded p-4 text-center">
                  No request body
                </div>
              )}
            </TabsContent>

            <TabsContent value="query" className="flex-1 overflow-auto mt-4">
              <div className="text-sm font-medium mb-2">Query Parameters</div>
              {formatQueryParams() ? (
                <SyntaxHighlighter
                  language="json"
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                  }}
                >
                  {formatQueryParams()}
                </SyntaxHighlighter>
              ) : (
                <div className="text-sm text-muted-foreground border rounded p-4 text-center">
                  No query parameters
                </div>
              )}
            </TabsContent>

            <TabsContent value="cookies" className="flex-1 overflow-auto mt-4">
              <div className="text-sm font-medium mb-2">Cookies</div>
              <SyntaxHighlighter
                language="json"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                }}
              >
                {formatCookies()}
              </SyntaxHighlighter>
            </TabsContent>

            <TabsContent value="notes" className="flex-1 overflow-auto mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Event Notes</div>
                {!isEditingNotes ? (
                  <Button size="sm" variant="ghost" onClick={() => setIsEditingNotes(true)}>
                    <IconEdit className="size-4" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={handleSaveNotes}>
                      <IconCheck className="size-4 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNotes(event.notes || "");
                        setIsEditingNotes(false);
                      }}
                    >
                      <IconX className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              {isEditingNotes ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this event..."
                  className="min-h-[200px] font-mono text-sm resize-none"
                />
              ) : notes ? (
                <div className="text-sm whitespace-pre-wrap p-4 bg-muted rounded-md">
                  {notes}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground border rounded p-4 text-center">
                  No notes yet. Click the edit button to add notes about this event.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
