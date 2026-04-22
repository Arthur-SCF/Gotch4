import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getMethodColor } from "@/lib/utils/colors";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Event {
  id: number;
  method: string;
  path: string;
  fullUrl: string;
  headers: string;
  body: string | null;
  cookies: string;
  queryParams: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface EventComparisonDialogProps {
  open: boolean;
  onClose: () => void;
  event1: Event | null;
  event2: Event | null;
}

export function EventComparisonDialog({
  open,
  onClose,
  event1,
  event2,
}: EventComparisonDialogProps) {
  if (!event1 || !event2) return null;

  const formatJSON = (str: string | null) => {
    if (!str) return "{}";
    try {
      const parsed = JSON.parse(str);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return str || "{}";
    }
  };

  const ComparisonSection = ({
    title,
    value1,
    value2,
    language = "json",
  }: {
    title: string;
    value1: string;
    value2: string;
    language?: string;
  }) => {
    const isDifferent = value1 !== value2;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{title}</h3>
          {isDifferent && (
            <Badge variant="destructive" className="text-xs">
              Different
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Event 1</div>
            <div className="border rounded-md overflow-hidden">
              <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  fontSize: "0.75rem",
                  maxHeight: "200px",
                }}
              >
                {value1}
              </SyntaxHighlighter>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Event 2</div>
            <div className="border rounded-md overflow-hidden">
              <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  fontSize: "0.75rem",
                  maxHeight: "200px",
                }}
              >
                {value2}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Event Comparison</DialogTitle>
          <DialogDescription>
            Comparing two captured HTTP requests side by side
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event Headers */}
          <div className="grid grid-cols-2 gap-4 pb-4 border-b">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={getMethodColor(event1.method)}>
                  {event1.method}
                </Badge>
                <span className="text-sm font-mono truncate">{event1.path}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(event1.createdAt).toLocaleString()}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={getMethodColor(event2.method)}>
                  {event2.method}
                </Badge>
                <span className="text-sm font-mono truncate">{event2.path}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(event2.createdAt).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Tabs for Different Sections */}
          <Tabs defaultValue="overview">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="headers">Headers</TabsTrigger>
              <TabsTrigger value="body">Body</TabsTrigger>
              <TabsTrigger value="query">Query & Cookies</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div>
                    <span className="text-muted-foreground">URL:</span>
                    <div className="font-mono text-xs break-all">{event1.fullUrl}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IP:</span>
                    <div className="font-mono text-xs">{event1.ipAddress || "N/A"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">User Agent:</span>
                    <div className="font-mono text-xs break-all">
                      {event1.userAgent || "N/A"}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-muted-foreground">URL:</span>
                    <div className="font-mono text-xs break-all">{event2.fullUrl}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IP:</span>
                    <div className="font-mono text-xs">{event2.ipAddress || "N/A"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">User Agent:</span>
                    <div className="font-mono text-xs break-all">
                      {event2.userAgent || "N/A"}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="headers">
              <ComparisonSection
                title="Request Headers"
                value1={formatJSON(event1.headers)}
                value2={formatJSON(event2.headers)}
              />
            </TabsContent>

            <TabsContent value="body">
              <ComparisonSection
                title="Request Body"
                value1={event1.body || "(empty)"}
                value2={event2.body || "(empty)"}
                language={event1.body && event1.body.startsWith("{") ? "json" : "text"}
              />
            </TabsContent>

            <TabsContent value="query" className="space-y-4">
              <ComparisonSection
                title="Query Parameters"
                value1={formatJSON(event1.queryParams)}
                value2={formatJSON(event2.queryParams)}
              />
              <ComparisonSection
                title="Cookies"
                value1={formatJSON(event1.cookies)}
                value2={formatJSON(event2.cookies)}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
