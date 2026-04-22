import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useEventSSE } from "@/hooks/useEventSSE";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HttpDnsEvent {
  _source: "event";
  id: number;
  type?: string;   // "http" | "dns"
  method?: string;
  path?: string;
  dnsQuery?: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface GrabFeedEntry {
  _source: "grab";
  id: number;
  key: string;
  method?: string;
  ipAddress: string | null;
  createdAt: string; // capturedAt renamed for uniformity
}

interface EzFeedEntry {
  _source: "ez";
  id: number;
  uri: string | null;
  origin: string | null;
  ipAddress: string | null;
  createdAt: string;
}

type FeedEntry = HttpDnsEvent | GrabFeedEntry | EzFeedEntry;

const MAX_FEED = 20;

// ── Styles ─────────────────────────────────────────────────────────────────────

const PILL_STYLES: Record<string, string> = {
  GET:    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-300/30",
  POST:   "bg-blue-500/15   text-blue-600   dark:text-blue-400   border-blue-300/30",
  PUT:    "bg-amber-500/15  text-amber-600  dark:text-amber-400  border-amber-300/30",
  DELETE: "bg-red-500/15    text-red-600    dark:text-red-400    border-red-300/30",
  PATCH:  "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-300/30",
  DNS:    "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-300/30",
  GRAB:   "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-300/30",
  XSS:    "bg-pink-500/15   text-pink-600   dark:text-pink-400   border-pink-300/30",
};

function getPillStyle(entry: FeedEntry): string {
  if (entry._source === "grab") return PILL_STYLES.GRAB;
  if (entry._source === "ez")   return PILL_STYLES.XSS;
  if ((entry as HttpDnsEvent).type === "dns") return PILL_STYLES.DNS;
  return PILL_STYLES[((entry as HttpDnsEvent).method ?? "").toUpperCase()] ?? "bg-muted text-muted-foreground";
}

function getLabel(entry: FeedEntry): string {
  if (entry._source === "grab") return "GRAB";
  if (entry._source === "ez")   return "XSS";
  if ((entry as HttpDnsEvent).type === "dns") return "DNS";
  return (entry as HttpDnsEvent).method ?? "???";
}

function getPath(entry: FeedEntry): string {
  if (entry._source === "grab") return (entry as GrabFeedEntry).key;
  if (entry._source === "ez")   return (entry as EzFeedEntry).origin ?? (entry as EzFeedEntry).uri ?? "—";
  const e = entry as HttpDnsEvent;
  if (e.type === "dns") return e.dnsQuery ?? e.path ?? "";
  return e.path ?? "";
}

// ── Time ───────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 5)  return "just now";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Flatten the Record<key, entries[]> response from /api/grab into FeedEntry[]. */
function flattenGrabs(raw: Record<string, any[]>): GrabFeedEntry[] {
  return Object.values(raw)
    .flat()
    .map((e) => ({
      _source: "grab" as const,
      id: e.id,
      key: e.key,
      method: e.method,
      ipAddress: e.ipAddress ?? null,
      createdAt: e.capturedAt ?? e.createdAt,
    }));
}

/** Map /api/ez response data into EzFeedEntry[]. */
function flattenEz(data: any[]): EzFeedEntry[] {
  return data.map((e) => ({
    _source: "ez" as const,
    id: e.id,
    uri: e.uri ?? null,
    origin: e.origin ?? null,
    ipAddress: e.ipAddress ?? null,
    createdAt: e.createdAt,
  }));
}

function mergeFeed(events: HttpDnsEvent[], grabs: GrabFeedEntry[], ezEntries: EzFeedEntry[] = []): FeedEntry[] {
  return [...events, ...grabs, ...ezEntries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_FEED);
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DashboardLiveFeed() {
  const [feed, setFeed] = React.useState<FeedEntry[]>([]);
  const [flashId, setFlashId] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  // Tick every 15s to refresh relative timestamps
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Initial HTTP+DNS events
  const { data: eventsData } = useQuery({
    queryKey: ["dashboard-feed-init-events"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/events?limit=20`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ data: any[] }>;
    },
    staleTime: Infinity,
  });

  // Initial grab entries
  const { data: grabData } = useQuery({
    queryKey: ["dashboard-feed-init-grabs"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/grab`);
      if (!res.ok) return {} as Record<string, any[]>;
      return res.json() as Promise<Record<string, any[]>>;
    },
    staleTime: Infinity,
  });

  // Initial EZ captures
  const { data: ezInitData } = useQuery({
    queryKey: ["dashboard-feed-init-ez"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/ez?limit=20`);
      if (!res.ok) return { data: [] as any[] };
      return res.json() as Promise<{ data: any[] }>;
    },
    staleTime: Infinity,
  });

  // Merge initial data once all are ready
  React.useEffect(() => {
    if (!eventsData && !grabData && !ezInitData) return;
    const events: HttpDnsEvent[] = (eventsData?.data ?? []).map((e: any) => ({
      _source: "event" as const,
      ...e,
    }));
    const grabs: GrabFeedEntry[] = grabData ? flattenGrabs(grabData) : [];
    const ezEntries: EzFeedEntry[] = ezInitData ? flattenEz(ezInitData.data) : [];
    setFeed(mergeFeed(events, grabs, ezEntries));
  }, [eventsData, grabData, ezInitData]);

  // Flash helper — stable key avoids id collision between types
  function flash(key: string) {
    setFlashId(key);
    setTimeout(() => setFlashId(null), 1200);
  }

  // Live: HTTP/DNS events
  const handleNewEvent = React.useCallback((event: any) => {
    const entry: HttpDnsEvent = { _source: "event", ...event };
    setFeed((prev) => [entry, ...prev].slice(0, MAX_FEED));
    flash(`event-${event.id}`);
  }, []);

  // Live: Grab captures
  const handleNewGrab = React.useCallback((_key: string, data: any) => {
    const entry: GrabFeedEntry = {
      _source: "grab",
      id: data.id,
      key: data.key,
      method: data.method,
      ipAddress: data.ipAddress ?? null,
      createdAt: data.capturedAt ?? new Date().toISOString(),
    };
    setFeed((prev) => [entry, ...prev].slice(0, MAX_FEED));
    flash(`grab-${data.id}`);
  }, []);

  // Live: EZ captures
  const handleNewEzCapture = React.useCallback((data?: any) => {
    if (!data) return;
    const entry: EzFeedEntry = {
      _source: "ez",
      id: data.id,
      uri: data.uri ?? null,
      origin: data.origin ?? null,
      ipAddress: data.ipAddress ?? null,
      createdAt: data.createdAt ?? new Date().toISOString(),
    };
    setFeed((prev) => [entry, ...prev].slice(0, MAX_FEED));
    flash(`ez-${data.id}`);
  }, []);

  useEventSSE(true, handleNewEvent, handleNewEzCapture, handleNewGrab);

  void tick; // suppress lint — used to force timestamp re-renders

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Live Feed
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
            last {Math.min(feed.length, MAX_FEED)} captures
          </Badge>
        </div>
        <CardDescription>Real-time incoming captures</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        {feed.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground px-6 py-8">
            <div className="text-center">
              <div className="font-mono text-xs mb-1 opacity-50">$ waiting for captures...</div>
              <div className="opacity-40">_</div>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-4 pb-4 font-mono text-xs">
            {feed.map((entry) => {
              const stableKey = `${entry._source}-${entry.id}`;
              return (
                <div
                  key={stableKey}
                  className={cn(
                    "flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0 transition-colors duration-700",
                    flashId === stableKey && "bg-primary/5"
                  )}
                >
                  {/* Type pill */}
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none border",
                      getPillStyle(entry)
                    )}
                  >
                    {getLabel(entry)}
                  </span>

                  {/* Path / key */}
                  <span className="flex-1 truncate text-foreground/80">
                    {getPath(entry)}
                  </span>

                  {/* IP */}
                  {entry.ipAddress && (
                    <span className="shrink-0 text-muted-foreground/60 hidden sm:inline">
                      {entry.ipAddress}
                    </span>
                  )}

                  {/* Time */}
                  <span className="shrink-0 text-muted-foreground/50 tabular-nums w-8 text-right">
                    {timeAgo(entry.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
