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
import { IconCopy, IconTrash, IconCheck, IconExternalLink, IconNote, IconEdit, IconX } from "@tabler/icons-react";
import { getMethodColor } from "@/lib/utils/colors";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProgramLinkSelector } from "@/components/ProgramLinkSelector";
import { useCopyButton } from "@/hooks/useCopyButton";

interface EventPreviewDrawerProps {
  event: any | null;
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  onLinkProgram: (programId: number | null) => void;
  onUpdateNotes: (notes: string) => void;
  programs: any[];
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
    try {
      const params = typeof event.queryParams === "string"
        ? JSON.parse(event.queryParams)
        : event.queryParams;
      return JSON.stringify(params, null, 2);
    } catch {
      return event.queryParams || "{}";
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
