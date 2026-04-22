import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEventSSE } from "@/hooks/useEventSSE";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IconCopy,
  IconTrash,
  IconSearch,
  IconLayoutGrid,
  IconLayoutList,
  IconFileExport,
  IconSortAscending,
  IconSortDescending,
  IconFolderOpen,
  IconFolderFilled,
  IconGitCompare,
  IconCalendar,
  IconFilter,
  IconBriefcase,
  IconNote,
  IconCopyCheck,
  IconPencil,
  IconCode,
  IconCookie,
  IconExternalLink,
} from "@tabler/icons-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { getMethodColor } from "@/lib/utils/colors";
import { EventPreviewDrawer } from "@/components/EventPreviewDrawer";
import { EventComparisonDialog } from "@/components/EventComparisonDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/security/events")({
  component: EventsPage,
});

// Must stay in sync with the RESERVED set in Backend/src/routes/settings.ts
const RESERVED_WEBHOOK_PATHS = new Set([
  'api', 'grab', 'ez',
  'files', 'programs', 'settings', 'auth',
  'security', 'tools',
]);

interface Event {
  id: number;
  _source?: "event" | "ez";
  type?: string; // "http" | "dns" | "ez"

  // HTTP fields
  method: string;
  path: string;
  fullUrl: string;
  headers: string;
  body: string | null;
  cookies: string;
  queryParams: string;

  // DNS fields
  dnsQuery?: string | null;
  dnsType?: string | null; // A, AAAA, TXT, MX, etc.

  // Common fields
  ipAddress: string | null;
  userAgent: string | null;
  programId: number | null;
  notes: string | null;
  createdAt: string;

  // ez-specific extras
  origin?: string | null;
}

interface EzCaptureItem {
  id: number;
  uri: string | null;
  origin: string | null;
  referer: string | null;
  userAgent: string | null;
  cookies: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface EzCaptureDetail extends EzCaptureItem {
  dom: string | null;
  localStorage: string | null;
  sessionStorage: string | null;
  hasScreenshot: boolean;
}

interface Program {
  id: number;
  name: string;
  status: string;
}

type SortField = "createdAt" | "method" | "path";
type SortOrder = "asc" | "desc";
type ViewMode = "table" | "grid";
type GroupBy = "none" | "program" | "method" | "date";
type DateRange = "all" | "today" | "yesterday" | "week" | "month" | "custom";

function EventsPage() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All"); // "All" | "http" | "dns"
  const [methodFilter, setMethodFilter] = useState<string>("All");
  const [programFilter, setProgramFilter] = useState<string>("All");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [compareEvents, setCompareEvents] = useState<Event[]>([]);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [editPath, setEditPath] = useState("");
  const [editPathError, setEditPathError] = useState("");

  // ez XSS detail sheet
  const [selectedEzId, setSelectedEzId] = useState<number | null>(null);
  const [isEzPreviewOpen, setIsEzPreviewOpen] = useState(false);

  // Delete confirmation states
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleteEventId, setDeleteEventId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch events with auto-refresh
  const { data: eventsResponse, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/events`);
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const events = (eventsResponse?.data || []) as Event[];

  // ez XSS captures
  const { data: ezResponse } = useQuery({
    queryKey: ["ez-captures-events"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/ez?limit=200`);
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: EzCaptureItem[] }>;
    },
  });

  // ez detail for the preview sheet
  const { data: ezDetail } = useQuery<EzCaptureDetail>({
    queryKey: ["ez-capture-detail", selectedEzId],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/ez/${selectedEzId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: isEzPreviewOpen && selectedEzId !== null,
  });

  // Live updates via SSE
  const handleNewEvent = useCallback((event: Event) => {
    queryClient.invalidateQueries({ queryKey: ["events"] });
    toast.success(`New ${event.method} request captured`, {
      description: event.path,
      duration: 3000,
    });
  }, [queryClient]);

  const handleNewEzCapture = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["ez-captures-events"] });
    toast.success("New ezXSS capture", { duration: 3000 });
  }, [queryClient]);

  useEventSSE(true, handleNewEvent, handleNewEzCapture);

  // Fetch settings (for webhook path)
  const { data: settings } = useQuery<{ webhookPath: string }>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings`);
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const webhookPath = settings?.webhookPath || "webhook";

  // Update webhook path mutation
  const updateWebhookPath = useMutation({
    mutationFn: async (path: string) => {
      const res = await apiFetch(`${API_URL}/api/settings/webhook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookPath: path }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update webhook path");
      return json;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<{ webhookPath: string }>(["settings"], (old) =>
        old ? { ...old, webhookPath: data.webhookPath } : old
      );
      setIsEditingPath(false);
      toast.success(`Webhook path updated to /${data.webhookPath}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update webhook path");
    },
  });

  // Fetch programs
  const { data: programsResponse } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/programs`);
      if (!res.ok) throw new Error("Failed to fetch programs");
      return res.json();
    },
  });
  const programs = (programsResponse?.data || []) as Program[];

  // Delete event mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_URL}/api/events/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete event");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete event");
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch(`${API_URL}/api/events/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to bulk delete events");
      return res.json();
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setSelectedEvents([]);
      toast.success(`${ids.length} event(s) deleted successfully`);
    },
    onError: () => {
      toast.error("Failed to delete events");
    },
  });

  // Delete all mutation
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API_URL}/api/events`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete all events");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setSelectedEvents([]);
      toast.success("All events cleared");
    },
    onError: () => {
      toast.error("Failed to clear events");
    },
  });

  // Link event to program mutation
  const linkProgramMutation = useMutation({
    mutationFn: async ({ eventId, programId }: { eventId: number; programId: number | null }) => {
      const res = await apiFetch(`${API_URL}/api/events/${eventId}/program`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      if (!res.ok) throw new Error("Failed to link event to program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      toast.success("Event linked to program successfully");
    },
    onError: () => {
      toast.error("Failed to link event to program");
    },
  });

  // Update event notes mutation
  const updateNotesMutation = useMutation({
    mutationFn: async ({ eventId, notes }: { eventId: number; notes: string }) => {
      const res = await apiFetch(`${API_URL}/api/events/${eventId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Failed to update event notes");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Notes updated successfully");
    },
    onError: () => {
      toast.error("Failed to update notes");
    },
  });

  // Bulk link to program mutation
  const bulkLinkProgramMutation = useMutation({
    mutationFn: async ({ eventIds, programId }: { eventIds: number[]; programId: number | null }) => {
      const promises = eventIds.map((eventId) =>
        apiFetch(`${API_URL}/api/events/${eventId}/program`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ programId }),
        })
      );
      await Promise.all(promises);
    },
    onSuccess: (_, { eventIds }) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      setSelectedEvents([]);
      toast.success(`${eventIds.length} event(s) linked successfully`);
    },
    onError: () => {
      toast.error("Failed to link events");
    },
  });

  const copyWebhookUrl = () => {
    const url = `${API_URL}/${webhookPath}`;
    navigator.clipboard.writeText(url);
    toast.success("Webhook URL copied to clipboard");
  };

  const openEventPreview = (event: Event) => {
    setSelectedEvent(event);
    setIsPreviewOpen(true);
  };

  const handleEventDelete = () => {
    if (selectedEvent) {
      setDeleteEventId(selectedEvent.id);
    }
  };

  const confirmDeleteEvent = () => {
    if (deleteEventId !== null) {
      deleteMutation.mutate(deleteEventId);
      if (selectedEvent?.id === deleteEventId) {
        setIsPreviewOpen(false);
        setSelectedEvent(null);
      }
      setDeleteEventId(null);
    }
  };

  const handleLinkProgram = (programId: number | null) => {
    if (selectedEvent) {
      linkProgramMutation.mutate({ eventId: selectedEvent.id, programId });
    }
  };

  const handleUpdateNotes = (notes: string) => {
    if (selectedEvent) {
      updateNotesMutation.mutate({ eventId: selectedEvent.id, notes });
    }
  };

  const toggleEventSelection = (id: number) => {
    setSelectedEvents((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleAllEvents = () => {
    if (selectedEvents.length === filteredAndSortedEvents.length) {
      setSelectedEvents([]);
    } else {
      setSelectedEvents(filteredAndSortedEvents.map((e) => e.id));
    }
  };

  const handleExport = (format: "json" | "csv" = "json") => {
    const eventsToExport = selectedEvents.length > 0
      ? filteredAndSortedEvents.filter((e) => selectedEvents.includes(e.id))
      : filteredAndSortedEvents;

    if (format === "json") {
      const blob = new Blob([JSON.stringify(eventsToExport, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `events-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // CSV export
      const headers = ["ID", "Method", "URL", "IP", "Program", "Timestamp"];
      const rows = eventsToExport.map((e) => [
        e.id,
        e.method,
        e.fullUrl,
        e.ipAddress || "N/A",
        e.programId ? programs.find((p) => p.id === e.programId)?.name || `Program #${e.programId}` : "Unlinked",
        new Date(e.createdAt).toLocaleString(),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `events-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    toast.success(`Exported ${eventsToExport.length} event(s) as ${format.toUpperCase()}`);
  };

  // Map ez captures to the shared Event shape so they flow through the same list
  const ezEntries = useMemo<Event[]>(() => {
    return (ezResponse?.data ?? []).map((ez): Event => ({
      _source: "ez",
      id: ez.id,
      type: "ez",
      method: "XSS",
      path: ez.uri || ez.origin || "",
      fullUrl: ez.uri || ez.origin || "",
      headers: "{}",
      body: null,
      cookies: ez.cookies || "",
      queryParams: "{}",
      ipAddress: ez.ipAddress,
      userAgent: ez.userAgent,
      programId: null,
      notes: null,
      createdAt: ez.createdAt,
      origin: ez.origin,
    }));
  }, [ezResponse]);

  // Filter and sort events
  const filteredAndSortedEvents = useMemo(() => {
    // Combine HTTP/DNS events with ez captures
    let result = [...events, ...ezEntries];

    // Filter by search (URL, path, IP)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.fullUrl.toLowerCase().includes(query) ||
          e.path.toLowerCase().includes(query) ||
          e.ipAddress?.toLowerCase().includes(query)
      );
    }

    // Filter by type (HTTP/DNS)
    if (typeFilter !== "All") {
      result = result.filter((e) => (e.type || "http") === typeFilter);
    }

    // Filter by method (HTTP only — ez entries are always excluded when a method is active)
    if (methodFilter !== "All") {
      result = result.filter((e) => e._source !== "ez" && e.method === methodFilter);
    }

    // Filter by program
    if (programFilter !== "All") {
      if (programFilter === "Unlinked") {
        result = result.filter((e) => !e.programId);
      } else {
        const programId = parseInt(programFilter);
        result = result.filter((e) => e.programId === programId);
      }
    }

    // Filter by date range
    if (dateRange !== "all") {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfWeek.getDate() - 7);
      const startOfMonth = new Date(startOfToday);
      startOfMonth.setDate(startOfMonth.getDate() - 30);

      result = result.filter((e) => {
        const eventDate = new Date(e.createdAt);
        switch (dateRange) {
          case "today":
            return eventDate >= startOfToday;
          case "yesterday":
            return eventDate >= startOfYesterday && eventDate < startOfToday;
          case "week":
            return eventDate >= startOfWeek;
          case "month":
            return eventDate >= startOfMonth;
          default:
            return true;
        }
      });
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "createdAt":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "method":
          comparison = a.method.localeCompare(b.method);
          break;
        case "path":
          comparison = a.path.localeCompare(b.path);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [events, ezEntries, searchQuery, typeFilter, methodFilter, programFilter, dateRange, sortField, sortOrder]);

  // Group events
  const groupedEvents = useMemo(() => {
    if (groupBy === "none") {
      return { "All Events": filteredAndSortedEvents };
    }

    const groups: Record<string, Event[]> = {};

    filteredAndSortedEvents.forEach((event) => {
      let groupKey = "";
      switch (groupBy) {
        case "program":
          if (event.programId) {
            const program = programs.find((p) => p.id === event.programId);
            groupKey = program?.name || `Program #${event.programId}`;
          } else {
            groupKey = "Unlinked";
          }
          break;
        case "method":
          groupKey = event.method;
          break;
        case "date":
          const date = new Date(event.createdAt);
          groupKey = date.toLocaleDateString();
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(event);
    });

    return groups;
  }, [filteredAndSortedEvents, groupBy, programs]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  // Helper to normalize headers by removing time-related fields
  const normalizeHeaders = (headersJson: string): string => {
    try {
      const headers = JSON.parse(headersJson);
      const timeRelatedHeaders = [
        'date', 'if-modified-since', 'if-unmodified-since', 'last-modified',
        'expires', 'age', 'retry-after', 'x-request-start', 'x-request-id',
        'x-correlation-id', 'x-amzn-requestid', 'request-id', 'cf-ray',
        'x-timer', 'x-runtime', 'x-request-time', 'timestamp'
      ];
      const normalized: Record<string, string> = {};
      Object.keys(headers).forEach((key) => {
        const lowerKey = key.toLowerCase();
        if (!timeRelatedHeaders.includes(lowerKey)) {
          normalized[key] = headers[key];
        }
      });
      return JSON.stringify(normalized);
    } catch {
      return headersJson;
    }
  };

  // Detect duplicates (strict comparison: method, URL, headers, body, cookies, query)
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, number[]>();
    events.forEach((event) => {
      // Skip DNS and EZ events for duplicate detection
      if (event._source === "ez" || event.type === "dns") return;
      
      // Create a comprehensive key including all relevant fields
      const normalizedHeaders = normalizeHeaders(event.headers || '{}');
      const key = JSON.stringify({
        method: event.method,
        fullUrl: event.fullUrl,
        headers: normalizedHeaders,
        body: event.body || '',
        cookies: event.cookies || '',
        queryParams: event.queryParams || ''
      });
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(event.id);
    });
    // Only keep groups with 2+ events
    const duplicates = new Map<string, number[]>();
    groups.forEach((ids, key) => {
      if (ids.length > 1) {
        duplicates.set(key, ids);
      }
    });
    return duplicates;
  }, [events]);

  const isDuplicate = (event: Event) => {
    if (event._source === "ez" || event.type === "dns") return false;
    for (const ids of duplicateGroups.values()) {
      if (ids.includes(event.id)) return true;
    }
    return false;
  };

  const getDuplicateCount = (event: Event) => {
    if (event._source === "ez" || event.type === "dns") return 0;
    const normalizedHeaders = normalizeHeaders(event.headers || '{}');
    const key = JSON.stringify({
      method: event.method,
      fullUrl: event.fullUrl,
      headers: normalizedHeaders,
      body: event.body || '',
      cookies: event.cookies || '',
      queryParams: event.queryParams || ''
    });
    return duplicateGroups.get(key)?.length || 0;
  };

  const methods = useMemo(() => {
    const methodSet = new Set(events.map((e) => e.method));
    return ["All", ...Array.from(methodSet)];
  }, [events]);

  const programOptions = useMemo(() => {
    return [
      "All",
      ...programs.map((p) => ({ id: p.id.toString(), name: p.name })),
      "Unlinked",
    ];
  }, [programs]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const toggleCompareMode = () => {
    setCompareMode(!compareMode);
    setCompareEvents([]);
    setSelectedEvents([]);
  };

  const addToCompare = (event: Event) => {
    if (compareEvents.length < 2) {
      setCompareEvents([...compareEvents, event]);
    }
  };

  const removeFromCompare = (eventId: number) => {
    setCompareEvents(compareEvents.filter((e) => e.id !== eventId));
  };

  // Statistics
  const stats = useMemo(() => {
    return {
      total: events.length,
      filtered: filteredAndSortedEvents.length,
      byMethod: methods.slice(1).map((method) => ({
        method,
        count: events.filter((e) => e.method === method).length,
      })),
    };
  }, [events, filteredAndSortedEvents, methods]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">HTTP Request Events</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Monitor captured HTTP requests to /{webhookPath} endpoint
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={copyWebhookUrl} className="w-full sm:w-auto">
            <IconCopy className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Copy Webhook URL</span>
            <span className="sm:hidden">Copy URL</span>
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowClearAllConfirm(true)}
            disabled={events.length === 0 || deleteAllMutation.isPending}
            className="w-full sm:w-auto"
          >
            <IconTrash className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Webhook Info */}
      <Card className="p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Webhook Endpoint:</span>
            {isEditingPath ? (
              <Button
                size="sm"
                className="h-5 px-2 text-xs"
                disabled={!!editPathError || !editPath || updateWebhookPath.isPending}
                onClick={() => {
                  if (!editPath || !/^[a-zA-Z0-9_-]+$/.test(editPath)) {
                    setEditPathError("Only letters, numbers, hyphens and underscores allowed");
                    return;
                  }
                  if (RESERVED_WEBHOOK_PATHS.has(editPath.toLowerCase())) {
                    setEditPathError(`"${editPath}" is reserved — choose a different name`);
                    return;
                  }
                  updateWebhookPath.mutate(editPath);
                }}
              >
                {updateWebhookPath.isPending ? "Saving..." : "Save"}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => {
                  setEditPath(webhookPath);
                  setEditPathError("");
                  setIsEditingPath(true);
                }}
              >
                <IconPencil className="h-3 w-3" />
              </Button>
            )}
          </div>
          {isEditingPath ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground font-mono shrink-0">{API_URL}/</span>
                <Input
                  value={editPath}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditPath(v);
                    if (!/^[a-zA-Z0-9_-]+$/.test(v)) {
                      setEditPathError("Only letters, numbers, hyphens and underscores allowed");
                    } else if (RESERVED_WEBHOOK_PATHS.has(v.toLowerCase())) {
                      setEditPathError(`"${v}" is reserved — choose a different name`);
                    } else {
                      setEditPathError("");
                    }
                  }}
                  className={`h-7 text-xs font-mono ${editPathError ? "border-red-500" : ""}`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (!editPath || !/^[a-zA-Z0-9_-]+$/.test(editPath)) return;
                      if (RESERVED_WEBHOOK_PATHS.has(editPath.toLowerCase())) return;
                      updateWebhookPath.mutate(editPath);
                    } else if (e.key === "Escape") {
                      setIsEditingPath(false);
                    }
                  }}
                />
              </div>
              {editPathError && (
                <p className="text-xs text-red-500">{editPathError}</p>
              )}
            </div>
          ) : (
            <code className="block rounded bg-muted p-2 text-xs sm:text-sm font-mono break-all">
              {API_URL}/{webhookPath}
            </code>
          )}
          <div className="text-xs text-muted-foreground">
            Send any HTTP request (GET, POST, PUT, DELETE, etc.) to this URL to capture it
          </div>
        </div>
      </Card>

      {/* Statistics */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">
          {stats.filtered} of {stats.total} events
        </span>
        {stats.byMethod.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {stats.byMethod.map(({ method, count }) => (
              <Badge key={method} className={cn(getMethodColor(method), "px-2 py-0.5 text-xs")}>
                {method} {count}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search URL, path, or IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <IconFilter className="size-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Types</SelectItem>
              <SelectItem value="http">HTTP Only</SelectItem>
              <SelectItem value="dns">DNS Only</SelectItem>
              <SelectItem value="ez">ezXSS Only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <IconFilter className="size-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {methods.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={programFilter} onValueChange={setProgramFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <IconBriefcase className="size-4 mr-2" />
              <SelectValue placeholder="All Programs" />
            </SelectTrigger>
            <SelectContent>
              {programOptions.map((option) =>
                typeof option === "string" ? (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ) : (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <IconCalendar className="size-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Grouping</SelectItem>
              <SelectItem value="program">By Program</SelectItem>
              <SelectItem value="method">By Method</SelectItem>
              <SelectItem value="date">By Date</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2 flex-1 justify-end">
            <Button
              variant={compareMode ? "default" : "outline"}
              size="icon"
              onClick={toggleCompareMode}
              title={compareMode ? "Exit comparison mode" : "Compare requests"}
            >
              <IconGitCompare className="size-4" />
            </Button>
            <Select onValueChange={(format) => handleExport(format as "json" | "csv")}>
              <SelectTrigger className="w-full sm:w-[120px]">
                <IconFileExport className="size-4 mr-2" />
                <SelectValue placeholder="Export" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">Export JSON</SelectItem>
                <SelectItem value="csv">Export CSV</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode(viewMode === "table" ? "grid" : "table")}
            >
              {viewMode === "table" ? (
                <IconLayoutGrid className="size-4" />
              ) : (
                <IconLayoutList className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedEvents.length > 0 && !compareMode && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {selectedEvents.length} selected
            </span>
            <Select
              onValueChange={(value) => {
                if (value === "unlink") {
                  bulkLinkProgramMutation.mutate({
                    eventIds: selectedEvents,
                    programId: null,
                  });
                } else {
                  bulkLinkProgramMutation.mutate({
                    eventIds: selectedEvents,
                    programId: parseInt(value),
                  });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Link to program" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value="unlink">Unlink</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowBulkDeleteConfirm(true)}
            >
              <IconTrash className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedEvents([])}
            >
              Clear Selection
            </Button>
          </div>
        )}

        {/* Comparison Mode */}
        {compareMode && (
          <div className="flex flex-col gap-2 p-3 bg-primary/10 rounded-lg border-2 border-primary">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Comparison Mode: Select 2 events to compare
              </span>
              <Button size="sm" variant="outline" onClick={toggleCompareMode}>
                Exit
              </Button>
            </div>
            {compareEvents.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {compareEvents.map((event) => (
                  <Card key={event.id} className="p-2 flex items-center gap-2">
                    <Badge className={getMethodColor(event.method)}>
                      {event.method}
                    </Badge>
                    <span className="text-xs font-mono truncate max-w-[140px] sm:max-w-[200px]">
                      {event.path}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFromCompare(event.id)}
                    >
                      <IconTrash className="size-3" />
                    </Button>
                  </Card>
                ))}
                {compareEvents.length === 2 && (
                  <Button
                    size="sm"
                    onClick={() => setIsComparisonOpen(true)}
                  >
                    Compare
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {viewMode === "table" ? (
        <div className="space-y-4">
          {Object.entries(groupedEvents).map(([groupKey, groupEvents]) => (
            <div key={groupKey} className="rounded-lg border overflow-hidden">
              {groupBy !== "none" && (
                <div
                  className="flex items-center justify-between p-3 bg-muted cursor-pointer hover:bg-muted/80"
                  onClick={() => toggleGroup(groupKey)}
                >
                  <div className="flex items-center gap-2">
                    {collapsedGroups.has(groupKey) ? (
                      <IconFolderFilled className="size-4" />
                    ) : (
                      <IconFolderOpen className="size-4" />
                    )}
                    <span className="font-medium">{groupKey}</span>
                    <Badge variant="secondary">{groupEvents.length}</Badge>
                  </div>
                </div>
              )}
              {!collapsedGroups.has(groupKey) && (
                <div className="overflow-x-auto">
                  <Table>
                    {groupBy === "none" && (
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={
                                selectedEvents.length === filteredAndSortedEvents.length &&
                                filteredAndSortedEvents.length > 0
                              }
                              onCheckedChange={toggleAllEvents}
                            />
                          </TableHead>
                          <TableHead className="min-w-[70px]">
                            <button
                              onClick={() => handleSort("method")}
                              className="flex items-center gap-1 hover:text-foreground"
                            >
                              Method
                              {sortField === "method" &&
                                (sortOrder === "asc" ? (
                                  <IconSortAscending className="size-4" />
                                ) : (
                                  <IconSortDescending className="size-4" />
                                ))}
                            </button>
                          </TableHead>
                          <TableHead className="min-w-[100px] sm:min-w-[180px]">
                            <button
                              onClick={() => handleSort("path")}
                              className="flex items-center gap-1 hover:text-foreground"
                            >
                              URL
                              {sortField === "path" &&
                                (sortOrder === "asc" ? (
                                  <IconSortAscending className="size-4" />
                                ) : (
                                  <IconSortDescending className="size-4" />
                                ))}
                            </button>
                          </TableHead>
                          <TableHead className="hidden lg:table-cell">Program</TableHead>
                          <TableHead className="hidden xl:table-cell">IP Address</TableHead>
                          <TableHead className="hidden xl:table-cell">
                            <button
                              onClick={() => handleSort("createdAt")}
                              className="flex items-center gap-1 hover:text-foreground"
                            >
                              Timestamp
                              {sortField === "createdAt" &&
                                (sortOrder === "asc" ? (
                                  <IconSortAscending className="size-4" />
                                ) : (
                                  <IconSortDescending className="size-4" />
                                ))}
                            </button>
                          </TableHead>
                          <TableHead className="min-w-[70px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                    )}
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : groupEvents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8">
                            <div className="text-muted-foreground">
                              {searchQuery || typeFilter !== "All" || methodFilter !== "All" || programFilter !== "All"
                                ? "No events match your filters"
                                : "No events captured yet. Send a request to the webhook endpoint to start monitoring."}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        groupEvents.map((event) => (
                          <TableRow
                            key={`${event._source ?? "event"}-${event.id}`}
                            className={cn(
                              "cursor-pointer hover:bg-muted/50",
                              event._source === "ez" && "bg-violet-500/5",
                              compareMode && compareEvents.some((e) => e.id === event.id) && "bg-primary/10"
                            )}
                            onClick={() => {
                              if (event._source === "ez") {
                                setSelectedEzId(event.id);
                                setIsEzPreviewOpen(true);
                                return;
                              }
                              if (compareMode) {
                                if (compareEvents.some((e) => e.id === event.id)) {
                                  removeFromCompare(event.id);
                                } else if (compareEvents.length < 2) {
                                  addToCompare(event);
                                } else {
                                  toast.error("You can only compare 2 events at a time");
                                }
                              } else {
                                openEventPreview(event);
                              }
                            }}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {!compareMode && event._source !== "ez" && (
                                <Checkbox
                                  checked={selectedEvents.includes(event.id)}
                                  onCheckedChange={() => toggleEventSelection(event.id)}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {event._source === "ez" ? (
                                  <Badge className="bg-violet-500 text-white text-xs gap-1 hover:bg-violet-600">
                                    <IconCode className="size-3" />
                                    ezXSS
                                  </Badge>
                                ) : event.type === "dns" ? (
                                  <Badge variant="secondary" className="gap-1">
                                    DNS
                                    {event.dnsType && <span className="text-xs opacity-70">({event.dnsType})</span>}
                                  </Badge>
                                ) : (
                                  <Badge className={getMethodColor(event.method)}>
                                    {event.method}
                                  </Badge>
                                )}
                                {isDuplicate(event) && (
                                  <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-600 border-amber-600">
                                    <IconCopyCheck className="size-3 mr-0.5" />
                                    {getDuplicateCount(event)}
                                  </Badge>
                                )}
                                {event.notes && (
                                  <IconNote className="size-3.5 text-muted-foreground" title="Has notes" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs sm:text-sm max-w-[150px] sm:max-w-md truncate"
                              title={event._source === "ez" ? (event.fullUrl || event.origin || "") : event.type === "dns" ? event.dnsQuery ?? "" : event.fullUrl}>
                              {event._source === "ez" ? (
                                <span className="flex flex-col gap-0.5">
                                  <span>{event.fullUrl || "(no uri)"}</span>
                                  {event.origin && <span className="text-muted-foreground text-xs">{event.origin}</span>}
                                </span>
                              ) : event.type === "dns" ? event.dnsQuery : event.fullUrl}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm">
                              {event._source === "ez" ? (
                                <span className="text-muted-foreground text-xs">—</span>
                              ) : event.programId ? (
                                <Badge variant="outline">
                                  {programs.find((p) => p.id === event.programId)?.name ||
                                    `Program #${event.programId}`}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">Unlinked</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden xl:table-cell font-mono text-xs sm:text-sm">
                              {event.ipAddress || "N/A"}
                            </TableCell>
                            <TableCell className="hidden xl:table-cell text-xs sm:text-sm">
                              {new Date(event.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-1">
                                {event._source !== "ez" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteEventId(event.id)}
                                  >
                                    <IconTrash className="size-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedEvents).map(([groupKey, groupEvents]) => (
            <div key={groupKey}>
              {groupBy !== "none" && (
                <div
                  className="flex items-center justify-between p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 mb-3"
                  onClick={() => toggleGroup(groupKey)}
                >
                  <div className="flex items-center gap-2">
                    {collapsedGroups.has(groupKey) ? (
                      <IconFolderFilled className="size-4" />
                    ) : (
                      <IconFolderOpen className="size-4" />
                    )}
                    <span className="font-medium">{groupKey}</span>
                    <Badge variant="secondary">{groupEvents.length}</Badge>
                  </div>
                </div>
              )}
              {!collapsedGroups.has(groupKey) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupEvents.map((event) => (
                    <Card
                      key={`${event._source ?? "event"}-${event.id}`}
                      className={cn(
                        "p-4 cursor-pointer hover:shadow-md transition-shadow",
                        event._source === "ez" && "border-violet-200 dark:border-violet-800",
                        selectedEvents.includes(event.id) && "ring-2 ring-primary",
                        compareMode && compareEvents.some((e) => e.id === event.id) && "ring-2 ring-primary bg-primary/10"
                      )}
                      onClick={() => {
                        if (event._source === "ez") {
                          setSelectedEzId(event.id);
                          setIsEzPreviewOpen(true);
                          return;
                        }
                        if (compareMode) {
                          if (compareEvents.some((e) => e.id === event.id)) {
                            removeFromCompare(event.id);
                          } else if (compareEvents.length < 2) {
                            addToCompare(event);
                          } else {
                            toast.error("You can only compare 2 events at a time");
                          }
                        } else {
                          openEventPreview(event);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {!compareMode && (
                          <Checkbox
                            checked={selectedEvents.includes(event.id)}
                            onCheckedChange={() => toggleEventSelection(event.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {event._source === "ez" ? (
                              <Badge className="bg-violet-500 text-white text-xs gap-1 hover:bg-violet-600">
                                <IconCode className="size-3" />
                                ezXSS
                              </Badge>
                            ) : event.type === "dns" ? (
                              <Badge variant="secondary" className="gap-1">
                                DNS
                                {event.dnsType && <span className="text-xs opacity-70">({event.dnsType})</span>}
                              </Badge>
                            ) : (
                              <Badge className={getMethodColor(event.method)}>
                                {event.method}
                              </Badge>
                            )}
                            {isDuplicate(event) && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-600 border-amber-600">
                                <IconCopyCheck className="size-3 mr-0.5" />
                                {getDuplicateCount(event)}
                              </Badge>
                            )}
                            {event.notes && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0">
                                <IconNote className="size-3 mr-0.5" />
                                Notes
                              </Badge>
                            )}
                            {event.programId && (
                              <Badge variant="outline" className="text-xs">
                                {programs.find((p) => p.id === event.programId)?.name}
                              </Badge>
                            )}
                          </div>
                          <p className="font-mono text-sm truncate"
                            title={event._source === "ez" ? (event.fullUrl || event.origin || "") : event.type === "dns" ? event.dnsQuery ?? "" : event.fullUrl}>
                            {event._source === "ez"
                              ? (event.fullUrl || event.origin || "(no uri)")
                              : event.type === "dns" ? event.dnsQuery : event.fullUrl}
                          </p>
                          {event._source === "ez" && event.origin && (
                            <p className="text-xs text-muted-foreground truncate">{event.origin}</p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {event.ipAddress && (
                              <>
                                <span className="font-mono">{event.ipAddress}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>{new Date(event.createdAt).toLocaleString()}</span>
                          </div>
                          {event._source !== "ez" && (
                            <div className="flex gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteEventId(event.id)}
                              >
                                <IconTrash className="size-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ezXSS Capture Preview */}
      <Sheet open={isEzPreviewOpen} onOpenChange={setIsEzPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Badge className="bg-violet-500 text-white text-xs gap-1 shrink-0">
                  <IconCode className="size-3" />
                  ezXSS
                </Badge>
                <SheetTitle className="text-sm font-mono truncate">
                  {ezDetail?.origin ?? "—"}
                </SheetTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5 text-xs"
                onClick={() => { setIsEzPreviewOpen(false); navigate({ to: "/security/ezxss" }); }}
              >
                <IconExternalLink className="size-3.5" />
                Open in ezXSS
              </Button>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-5 py-4 space-y-4 text-sm">
            {!ezDetail ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : (
              <>
                {ezDetail.uri && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">URI</p>
                    <p className="font-mono text-xs break-all">{ezDetail.uri}</p>
                  </div>
                )}
                {ezDetail.origin && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Origin</p>
                    <p className="font-mono text-xs">{ezDetail.origin}</p>
                  </div>
                )}
                {ezDetail.referer && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Referer</p>
                    <p className="font-mono text-xs break-all">{ezDetail.referer}</p>
                  </div>
                )}
                {ezDetail.ipAddress && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">IP Address</p>
                    <p className="font-mono text-xs">{ezDetail.ipAddress}</p>
                  </div>
                )}
                {ezDetail.userAgent && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">User Agent</p>
                    <p className="text-xs break-all">{ezDetail.userAgent}</p>
                  </div>
                )}
                {ezDetail.cookies && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <IconCookie className="size-3" /> Cookies
                      </p>
                      <Button
                        variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1"
                        onClick={() => { navigator.clipboard.writeText(ezDetail.cookies!); toast.success("Cookies copied"); }}
                      >
                        <IconCopy className="size-3" /> Copy
                      </Button>
                    </div>
                    <pre className="bg-muted/40 rounded-md px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">
                      {ezDetail.cookies}
                    </pre>
                  </div>
                )}
                <div className="space-y-0.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Captured at</p>
                  <p className="text-xs">{new Date(ezDetail.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2 flex-wrap pt-2">
                  {!!ezDetail.dom && <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">DOM</Badge>}
                  {ezDetail.hasScreenshot && <Badge variant="outline" className="text-xs border-violet-300 text-violet-600">Screenshot</Badge>}
                  {ezDetail.localStorage && <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">localStorage</Badge>}
                  {ezDetail.sessionStorage && <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">sessionStorage</Badge>}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Event Preview Drawer */}
      <EventPreviewDrawer
        event={selectedEvent}
        open={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setSelectedEvent(null);
        }}
        onDelete={handleEventDelete}
        onLinkProgram={handleLinkProgram}
        onUpdateNotes={handleUpdateNotes}
        programs={programs}
      />

      {/* Event Comparison Dialog */}
      <EventComparisonDialog
        open={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        event1={compareEvents[0] || null}
        event2={compareEvents[1] || null}
      />

      {/* Clear All Confirmation */}
      <AlertDialog open={showClearAllConfirm} onOpenChange={setShowClearAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all events?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {events.length} captured event{events.length !== 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { deleteAllMutation.mutate(); setShowClearAllConfirm(false); }}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected events?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedEvents.length} selected event{selectedEvents.length !== 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { bulkDeleteMutation.mutate(selectedEvents); setShowBulkDeleteConfirm(false); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Event Delete Confirmation */}
      <AlertDialog open={deleteEventId !== null} onOpenChange={(open) => { if (!open) setDeleteEventId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the captured event. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteEvent}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
