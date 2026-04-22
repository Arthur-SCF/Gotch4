import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconPlus,
  IconTrash,
  IconCopy,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconX,
  IconWifi,
  IconBriefcase,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { useCopyButton } from "@/hooks/useCopyButton";
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

export const Route = createFileRoute("/security/grab")({
  component: GrabPage,
});

interface GrabEntry {
  id: number;
  key: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: string | null;
  ipAddress: string | null;
  capturedAt: string;
}

interface GrabSlot {
  key: string;
  entries: GrabEntry[];
}

interface Program {
  id: number;
  name: string;
}

interface KeyMeta {
  programId: number | null;
  programName: string | null;
}

// M-08: replace https→wss before http→ws so https isn't partially replaced
const WS_URL = API_URL.replace(/^https/, "wss").replace(/^http/, "ws") + "/api/ws/events";

function GrabPage() {
  const STORAGE_KEY = "grab-slot-keys";

  const loadStoredKeys = (): string[] => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
  };

  const saveStoredKeys = (keys: string[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  };

  const [slots, setSlots] = useState<GrabSlot[]>(() =>
    loadStoredKeys().map((key) => ({ key, entries: [] }))
  );
  const [newKey, setNewKey] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [wsConnected, setWsConnected] = useState(false);
  const [clearEntriesKey, setClearEntriesKey] = useState<string | null>(null);
  const [deleteSlotKey, setDeleteSlotKey] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { copy, isCopied } = useCopyButton();

  // Load existing grab data on mount
  const { data: initialData } = useQuery({
    queryKey: ["grabs"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/grab`);
      if (!res.ok) throw new Error("Failed to fetch grabs");
      return res.json() as Promise<Record<string, GrabEntry[]>>;
    },
  });

  // Load all programs for the dropdown
  const { data: programsData } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/programs?limit=200`);
      if (!res.ok) throw new Error("Failed to fetch programs");
      return res.json();
    },
  });
  const programs: Program[] = programsData?.data ?? [];

  // Load all grab key metas (batch)
  const { data: metas } = useQuery<Record<string, KeyMeta>>({
    queryKey: ["grab-metas"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/grab/metas`);
      if (!res.ok) throw new Error("Failed to fetch grab metas");
      return res.json();
    },
  });

  useEffect(() => {
    if (!initialData) return;
    setSlots((prev) => {
      const serverKeys = Object.keys(initialData);
      const allKeys = Array.from(new Set([...prev.map((s) => s.key), ...serverKeys]));
      const merged = allKeys.map((key) => {
        const serverEntries = initialData[key] ?? [];
        const liveEntries = prev.find((s) => s.key === key)?.entries ?? [];
        // M-09: prefer the longer list — live WS entries may be newer than the query result
        return { key, entries: liveEntries.length > serverEntries.length ? liveEntries : serverEntries };
      });
      saveStoredKeys(merged.map((s) => s.key));
      return merged;
    });
  }, [initialData]);

  // WebSocket for real-time grab events
  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let destroyed = false;

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
          if (msg.type !== "grab") return;
          const { key, data } = msg as { key: string; data: GrabEntry };

          setSlots((prev) => {
            const idx = prev.findIndex((s) => s.key === key);
            let next: GrabSlot[];
            if (idx === -1) {
              next = [...prev, { key, entries: [data] }];
            } else {
              next = [...prev];
              next[idx] = { ...next[idx], entries: [...next[idx].entries, data] };
            }
            saveStoredKeys(next.map((s) => s.key));
            return next;
          });

          setExpandedKeys((prev) => new Set([...prev, key]));
          toast.success(`Grab captured: ${key}`, {
            description: `${data.method} from ${data.ipAddress}`,
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

  const clearEntriesMutation = useMutation({
    mutationFn: async (key: string) => {
      await apiFetch(`${API_URL}/api/grab/${key}/entries`, { method: "DELETE" });
    },
    onSuccess: (_, key) => {
      setSlots((prev) =>
        prev.map((s) => (s.key === key ? { ...s, entries: [] } : s))
      );
      toast.success("Entries cleared");
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: async (key: string) => {
      await apiFetch(`${API_URL}/api/grab/${key}`, { method: "DELETE" });
    },
    onSuccess: (_, key) => {
      setSlots((prev) => {
        const next = prev.filter((s) => s.key !== key);
        saveStoredKeys(next.map((s) => s.key));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["grab-metas"] });
      toast.success("Slot deleted");
    },
  });

  // Link/unlink grab key to a program
  const linkProgramMutation = useMutation({
    mutationFn: async ({ key, programId }: { key: string; programId: number | null }) => {
      const res = await apiFetch(`${API_URL}/api/grab/${key}/meta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      if (!res.ok) throw new Error("Failed to link program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grab-metas"] });
    },
    onError: () => toast.error("Failed to update program link"),
  });

  const addSlot = () => {
    const key = newKey.trim();
    if (!key) return;
    if (slots.some((s) => s.key === key)) {
      toast.error("A slot with this key already exists");
      return;
    }
    setSlots((prev) => {
      const next = [...prev, { key, entries: [] }];
      saveStoredKeys(next.map((s) => s.key));
      return next;
    });
    setExpandedKeys((prev) => new Set([...prev, key]));
    setNewKey("");
  };

  const toggleSlot = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleEntry = (id: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const grabUrl = (key: string) => `${API_URL}/grab/${key}`;
  const pollUrl = (key: string) => `${API_URL}/api/grab/${key}`;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">OOB Grab</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Capture specific values from cross-origin requests for use in exploit chains
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-xs ${wsConnected ? "text-green-500" : "text-muted-foreground"}`}>
            <IconWifi className="size-3.5" />
            {wsConnected ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </div>

      {/* New slot */}
      <div className="flex gap-2">
        <Input
          placeholder="Grab key (e.g. csrf, flag, token)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSlot()}
          className="w-full sm:max-w-sm font-mono"
        />
        <Button onClick={addSlot} disabled={!newKey.trim()}>
          <IconPlus className="size-4 mr-2" />
          Add Slot
        </Button>
      </div>

      {/* Usage hint */}
      <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground font-mono space-y-1">
        <p><span className="text-foreground font-semibold">Capture URL:</span> {API_URL}/grab/<span className="text-primary">&lt;key&gt;</span> — redirect the victim here (any method, full CORS)</p>
        <p><span className="text-foreground font-semibold">Poll URL:</span> {API_URL}/api/grab/<span className="text-primary">&lt;key&gt;</span> — fetch from your exploit script (returns JSON)</p>
        <p><span className="text-foreground font-semibold">Single-use:</span> add <span className="text-primary">?once=true</span> to the poll URL to pop and clear on first read</p>
      </div>

      {/* Clear Entries Confirmation */}
      <AlertDialog open={clearEntriesKey !== null} onOpenChange={(open) => { if (!open) setClearEntriesKey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entries for "{clearEntriesKey}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all captured entries for this slot. The slot key will be kept. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (clearEntriesKey) { clearEntriesMutation.mutate(clearEntriesKey); setClearEntriesKey(null); } }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Slot Confirmation */}
      <AlertDialog open={deleteSlotKey !== null} onOpenChange={(open) => { if (!open) setDeleteSlotKey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete slot "{deleteSlotKey}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the slot and all its captured entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteSlotKey) { deleteSlotMutation.mutate(deleteSlotKey); setDeleteSlotKey(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <p className="text-sm">No grab slots yet.</p>
          <p className="text-xs">Add a key above, then redirect a victim request to the capture URL.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map((slot) => {
            const meta = metas?.[slot.key];
            const linkedProgramId = meta?.programId ?? null;
            const linkedProgramName = meta?.programName ?? null;

            return (
              <Collapsible
                key={slot.key}
                open={expandedKeys.has(slot.key)}
                onOpenChange={() => toggleSlot(slot.key)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          {expandedKeys.has(slot.key)
                            ? <IconChevronUp className="size-4 flex-shrink-0 text-muted-foreground" />
                            : <IconChevronDown className="size-4 flex-shrink-0 text-muted-foreground" />
                          }
                          <CardTitle className="text-sm font-mono font-semibold truncate">
                            {slot.key}
                          </CardTitle>
                          <Badge variant={slot.entries.length > 0 ? "default" : "secondary"} className="flex-shrink-0">
                            {slot.entries.length} capture{slot.entries.length !== 1 ? "s" : ""}
                          </Badge>
                          {linkedProgramName && (
                            <Badge variant="outline" className="flex-shrink-0 gap-1 text-xs border-primary/30 text-primary hidden sm:flex">
                              <IconBriefcase className="size-3" />
                              {linkedProgramName}
                            </Badge>
                          )}
                          {slot.entries.length > 0 && (
                            <span className="text-xs text-muted-foreground hidden lg:block">
                              last: {new Date(slot.entries[slot.entries.length - 1].capturedAt).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 flex-wrap gap-y-1" onClick={(e) => e.stopPropagation()}>
                          {/* Program linker */}
                          <Select
                            value={linkedProgramId ? String(linkedProgramId) : "none"}
                            onValueChange={(val) => {
                              const programId = val === "none" ? null : parseInt(val);
                              linkProgramMutation.mutate({ key: slot.key, programId });
                            }}
                          >
                            <SelectTrigger className="h-7 w-auto min-w-[110px] text-xs gap-1 border-dashed">
                              <IconBriefcase className="size-3 text-muted-foreground flex-shrink-0" />
                              <SelectValue placeholder="Link program" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                <span className="text-muted-foreground">No program</span>
                              </SelectItem>
                              {programs.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => copy(grabUrl(slot.key), `grab-${slot.key}`, "capture URL")}>
                            {isCopied(`grab-${slot.key}`) ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
                            <span className="ml-1 hidden sm:inline">Capture URL</span>
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => copy(pollUrl(slot.key), `poll-${slot.key}`, "poll URL")}>
                            {isCopied(`poll-${slot.key}`) ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
                            <span className="ml-1 hidden sm:inline">Poll URL</span>
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setClearEntriesKey(slot.key)} disabled={slot.entries.length === 0}>
                            <IconX className="size-3.5" />
                            <span className="ml-1 hidden sm:inline">Clear</span>
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteSlotKey(slot.key)}>
                            <IconTrash className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 px-4 pb-4">
                      {/* URLs */}
                      <div className="space-y-1.5 mb-4 text-xs font-mono bg-muted/50 rounded-md p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16 flex-shrink-0">Capture</span>
                          <span className="text-primary truncate">{grabUrl(slot.key)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16 flex-shrink-0">Poll</span>
                          <span className="truncate">{pollUrl(slot.key)}</span>
                        </div>
                      </div>

                      {slot.entries.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Waiting for first capture…
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {slot.entries.map((entry, idx) => (
                            <Collapsible
                              key={entry.id}
                              open={expandedEntries.has(entry.id)}
                              onOpenChange={() => toggleEntry(entry.id)}
                            >
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded-md px-2 py-1.5 text-xs">
                                  {expandedEntries.has(entry.id)
                                    ? <IconChevronUp className="size-3.5 text-muted-foreground" />
                                    : <IconChevronDown className="size-3.5 text-muted-foreground" />
                                  }
                                  <Badge variant="outline" className="text-xs font-mono">{entry.method}</Badge>
                                  <span className="text-muted-foreground">#{idx + 1}</span>
                                  <span className="text-muted-foreground">{entry.ipAddress}</span>
                                  <span className="ml-auto text-muted-foreground">
                                    {new Date(entry.capturedAt).toLocaleTimeString()}
                                  </span>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-1 space-y-2 pl-4">
                                  <div>
                                    <p className="text-xs font-semibold text-muted-foreground mb-1">Headers</p>
                                    <div className="bg-muted rounded-md p-2 text-xs font-mono space-y-0.5 max-h-40 overflow-auto">
                                      {Object.entries(entry.headers).map(([k, v]) => (
                                        <div key={k} className="flex gap-2 min-w-0">
                                          <span className="text-primary flex-shrink-0">{k}:</span>
                                          <span className="break-all">{v}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {Object.keys(entry.query).length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-1">Query Params</p>
                                      <div className="bg-muted rounded-md p-2 text-xs font-mono space-y-0.5">
                                        {Object.entries(entry.query).map(([k, v]) => (
                                          <div key={k} className="flex gap-2">
                                            <span className="text-primary">{k}:</span>
                                            <span className="break-all">{v}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {entry.body && (
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-1">Body</p>
                                      <pre className="bg-muted rounded-md p-2 text-xs font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">{entry.body}</pre>
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
