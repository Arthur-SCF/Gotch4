import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import {
  Card,
  CardHeader,
  CardDescription,
  CardTitle,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconRadar,
  IconBriefcase,
  IconClock,
  IconServer,
} from "@tabler/icons-react";
import { Wifi, WifiOff } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Event {
  id: number;
  type?: string;
  method?: string;
  path?: string;
  dnsQuery?: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface GrabEntry {
  id: number;
  key: string;
  method?: string;
  ipAddress: string | null;
  capturedAt: string;
}

interface EzEntry {
  id: number;
  uri: string | null;
  origin: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface Program {
  id: number;
  status: string;
}

interface Settings {
  webhookPath: string;
}

interface DnsStatus {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  nsConfigured: boolean;
  domain: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const METHOD_BADGE_CLASSES: Record<string, string> = {
  GET:    "border-green-200  text-green-600  dark:border-green-800  dark:text-green-400",
  POST:   "border-blue-200   text-blue-600   dark:border-blue-800   dark:text-blue-400",
  PUT:    "border-amber-200  text-amber-600  dark:border-amber-800  dark:text-amber-400",
  DELETE: "border-red-200    text-red-600    dark:border-red-800    dark:text-red-400",
  PATCH:  "border-purple-200 text-purple-600 dark:border-purple-800 dark:text-purple-400",
  DNS:    "border-violet-200 text-violet-600 dark:border-violet-800 dark:text-violet-400",
  GRAB:   "border-orange-200 text-orange-600 dark:border-orange-800 dark:text-orange-400",
  XSS:    "border-pink-200   text-pink-600   dark:border-pink-800   dark:text-pink-400",
};

type CaptureKind =
  | { kind: "event"; data: Event;     ts: number }
  | { kind: "grab";  data: GrabEntry; ts: number }
  | { kind: "ez";    data: EzEntry;   ts: number };

function getLastCaptureLabel(c: CaptureKind): string {
  if (c.kind === "grab") return "GRAB";
  if (c.kind === "ez")   return "XSS";
  if (c.data.type === "dns") return "DNS";
  return c.data.method ?? "HTTP";
}

function getLastCapturePath(c: CaptureKind): string {
  if (c.kind === "grab") return c.data.key;
  if (c.kind === "ez")   return c.data.origin ?? c.data.uri ?? "—";
  if (c.data.type === "dns") return c.data.dnsQuery ?? c.data.path ?? "";
  return c.data.path ?? "";
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) >= today;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DashboardKpiCards() {
  // HTTP + DNS events
  const { data: eventsData } = useQuery({
    queryKey: ["dashboard-events", { limit: 500 }],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/events?limit=500`);
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json() as Promise<{ data: Event[]; pagination: { total: number } }>;
    },
    refetchInterval: 30_000,
  });

  // Grab captures (flat list per key)
  const { data: grabRaw } = useQuery({
    queryKey: ["dashboard-grabs"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/grab`);
      if (!res.ok) return {} as Record<string, GrabEntry[]>;
      return res.json() as Promise<Record<string, GrabEntry[]>>;
    },
    refetchInterval: 30_000,
  });

  // EZ captures (just need count + latest)
  const { data: ezData } = useQuery({
    queryKey: ["dashboard-ez", { limit: 10 }],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/ez?limit=10`);
      if (!res.ok) return { data: [] as EzEntry[], pagination: { total: 0 } };
      return res.json() as Promise<{ data: EzEntry[]; pagination: { total: number } }>;
    },
    refetchInterval: 30_000,
  });

  // Programs
  const { data: programsData } = useQuery({
    queryKey: ["dashboard-programs", { limit: 100 }],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/programs?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch programs");
      return res.json() as Promise<{ data: Program[]; pagination: { total: number } }>;
    },
    refetchInterval: 60_000,
  });

  // DNS status
  const { data: dnsStatus } = useQuery<DnsStatus>({
    queryKey: ["dns-status"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/dns/status`);
      if (!res.ok) throw new Error("Failed to fetch DNS status");
      return res.json();
    },
    refetchInterval: 10_000,
  });

  // Settings (webhook path)
  const { data: settings } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings`);
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  // ── Counts ──────────────────────────────────────────────────────────────────

  const eventsTotal = eventsData?.pagination.total ?? null;
  const allGrabs: GrabEntry[] = grabRaw
    ? Object.values(grabRaw).flat().map((e) => ({ ...e, capturedAt: e.capturedAt ?? (e as any).createdAt }))
    : [];
  const grabTotal = grabRaw !== undefined ? allGrabs.length : null;
  const ezTotal   = ezData?.pagination.total ?? null;

  const totalCaptures =
    eventsTotal !== null && grabTotal !== null && ezTotal !== null
      ? eventsTotal + grabTotal + ezTotal
      : null;

  // Today counts
  const eventsTodayCount = eventsData?.data.filter((e) => isToday(e.createdAt)).length ?? 0;
  const grabsTodayCount  = allGrabs.filter((g) => isToday(g.capturedAt)).length;
  const ezTodayCount     = ezData?.data.filter((e) => isToday(e.createdAt)).length ?? 0;
  const todayCount       = eventsTodayCount + grabsTodayCount + ezTodayCount;
  const dataLoaded       = eventsData !== undefined && grabRaw !== undefined && ezData !== undefined;

  // ── Most recent capture across all types ────────────────────────────────────

  const candidates: CaptureKind[] = [
    ...(eventsData?.data[0]  ? [{ kind: "event" as const, data: eventsData.data[0],  ts: new Date(eventsData.data[0].createdAt).getTime() }] : []),
    ...(allGrabs.length > 0  ? [{ kind: "grab"  as const, data: allGrabs.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0], ts: new Date(allGrabs[0].capturedAt).getTime() }] : []),
    ...(ezData?.data[0]      ? [{ kind: "ez"    as const, data: ezData.data[0],       ts: new Date(ezData.data[0].createdAt).getTime() }] : []),
  ];
  const recentCapture = candidates.length > 0
    ? candidates.reduce((best, c) => c.ts > best.ts ? c : best)
    : null;

  const lastLabel = recentCapture ? getLastCaptureLabel(recentCapture) : null;
  const lastLabelClass = lastLabel ? (METHOD_BADGE_CLASSES[lastLabel] ?? "border-muted text-muted-foreground") : "";
  const lastTs    = recentCapture?.kind === "grab" ? (recentCapture.data as GrabEntry).capturedAt : recentCapture?.kind === "ez" ? (recentCapture.data as EzEntry).createdAt : (recentCapture?.data as Event | undefined)?.createdAt;
  const lastIp    = recentCapture?.data.ipAddress ?? null;

  // ── Programs ────────────────────────────────────────────────────────────────

  const totalPrograms    = programsData?.pagination.total ?? null;
  const activePrograms   = programsData?.data.filter((p) => p.status === "active").length ?? null;
  const nonActivePrograms = totalPrograms !== null && activePrograms !== null ? totalPrograms - activePrograms : null;

  // ── DNS ─────────────────────────────────────────────────────────────────────

  const dnsHealthy    = dnsStatus?.enabled && dnsStatus?.running && dnsStatus?.nsConfigured;
  const dnsEnabled    = dnsStatus?.enabled ?? false;
  const dnsConfigured = dnsStatus?.configured;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">

      {/* Total Captures */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <IconRadar className="size-3.5" />
            Total Captures
          </CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalCaptures === null ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              totalCaptures.toLocaleString()
            )}
          </CardTitle>
          {dataLoaded && todayCount > 0 && (
            <CardAction>
              <Badge
                variant="outline"
                className="border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
              >
                +{todayCount} today
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">HTTP, DNS, Grab &amp; EZ captures</div>
          <div className="text-muted-foreground">All time, across all programs</div>
        </CardFooter>
      </Card>

      {/* Last Capture */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <IconClock className="size-3.5" />
            Last Capture
          </CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {!dataLoaded ? (
              <Skeleton className="h-8 w-24" />
            ) : recentCapture ? (
              <span className="text-xl">{timeAgo(lastTs!)}</span>
            ) : (
              <span className="text-base text-muted-foreground">No captures yet</span>
            )}
          </CardTitle>
          {lastLabel && (
            <CardAction>
              <Badge
                variant="outline"
                className={`font-mono text-xs ${lastLabelClass}`}
              >
                {lastLabel}
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {recentCapture ? (
            <>
              <div className="font-mono text-xs font-medium truncate max-w-full">
                {getLastCapturePath(recentCapture)}
              </div>
              <div className="text-muted-foreground">
                {lastIp ?? "unknown IP"}
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">Waiting for first capture</div>
          )}
        </CardFooter>
      </Card>

      {/* Programs */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <IconBriefcase className="size-3.5" />
            Programs
          </CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {activePrograms === null ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                {activePrograms}
                <span className="text-base text-muted-foreground font-normal ml-1.5">
                  / {totalPrograms}
                </span>
              </>
            )}
          </CardTitle>
          {activePrograms !== null && activePrograms > 0 && (
            <CardAction>
              <Badge
                variant="outline"
                className="border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
              >
                Active
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">
            {activePrograms === 0
              ? "No active programs"
              : `${activePrograms} active program${activePrograms === 1 ? "" : "s"}`}
          </div>
          <div className="text-muted-foreground">
            {nonActivePrograms !== null && nonActivePrograms > 0
              ? `${nonActivePrograms} paused / archived`
              : "All programs active"}
          </div>
        </CardFooter>
      </Card>

      {/* Infrastructure */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <IconServer className="size-3.5" />
            Infrastructure
          </CardDescription>
          <CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">
            {dnsStatus === undefined ? (
              <Skeleton className="h-8 w-20" />
            ) : dnsHealthy ? (
              <span className="text-emerald-600 dark:text-emerald-400">Online</span>
            ) : dnsEnabled ? (
              <span className="text-amber-600 dark:text-amber-400">Degraded</span>
            ) : dnsConfigured ? (
              <span className="text-muted-foreground">Disabled</span>
            ) : (
              <span className="text-muted-foreground">No DNS</span>
            )}
          </CardTitle>
          <CardAction>
            <Badge
              variant="outline"
              className={
                dnsHealthy
                  ? "border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
                  : dnsEnabled
                  ? "border-amber-200 text-amber-600 dark:border-amber-800 dark:text-amber-400"
                  : ""
              }
            >
              {dnsHealthy ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
              DNS
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {dnsStatus?.domain ? (
            <div className="font-mono text-xs font-medium truncate max-w-full">
              {dnsStatus.domain}
            </div>
          ) : (
            <div className="font-medium">DNS not configured</div>
          )}
          <div className="text-muted-foreground">
            Webhook:{" "}
            <span className="font-mono">/{settings?.webhookPath ?? "webhook"}</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
