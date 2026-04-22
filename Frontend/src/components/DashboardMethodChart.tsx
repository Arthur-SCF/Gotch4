import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Event {
  id: number;
  type?: string;
  method: string;
  createdAt: string;
}

const METHOD_STYLES: Record<
  string,
  { bar: string; badge: string; label: string }
> = {
  GET: {
    bar: "bg-emerald-500",
    badge: "text-emerald-600 dark:text-emerald-400",
    label: "GET",
  },
  POST: {
    bar: "bg-blue-500",
    badge: "text-blue-600 dark:text-blue-400",
    label: "POST",
  },
  PUT: {
    bar: "bg-amber-500",
    badge: "text-amber-600 dark:text-amber-400",
    label: "PUT",
  },
  DELETE: {
    bar: "bg-red-500",
    badge: "text-red-600 dark:text-red-400",
    label: "DELETE",
  },
  PATCH: {
    bar: "bg-purple-500",
    badge: "text-purple-600 dark:text-purple-400",
    label: "PATCH",
  },
  DNS: {
    bar: "bg-violet-500",
    badge: "text-violet-600 dark:text-violet-400",
    label: "DNS",
  },
};

const FALLBACK_STYLE = {
  bar: "bg-muted-foreground/50",
  badge: "text-muted-foreground",
  label: "",
};

function getMethodStyle(method: string) {
  return METHOD_STYLES[method.toUpperCase()] ?? FALLBACK_STYLE;
}

export function DashboardMethodChart() {
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ["dashboard-events", { limit: 500 }],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/events?limit=500`);
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json() as Promise<{
        data: Event[];
        pagination: { total: number };
      }>;
    },
    refetchInterval: 30_000,
  });

  const breakdown = React.useMemo(() => {
    if (!eventsData?.data) return [];

    const counts: Record<string, number> = {};

    for (const event of eventsData.data) {
      const key = event.type === "dns" ? "DNS" : (event.method ?? "UNKNOWN");
      counts[key] = (counts[key] ?? 0) + 1;
    }

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);

    return entries.map(([method, count]) => ({
      method,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  }, [eventsData]);

  const total = breakdown.reduce((s, d) => s + d.count, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>By Method</CardTitle>
        <CardDescription>
          Distribution of the last {eventsData?.data.length ?? "…"} captures
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-4">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-6 w-full rounded" />
            ))}
          </div>
        ) : breakdown.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No captures yet
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {breakdown.map(({ method, count, pct }) => {
              const style = getMethodStyle(method);
              return (
                <div key={method} className="group flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-mono font-semibold", style.badge)}>
                      {method}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {count.toLocaleString()}{" "}
                      <span className="opacity-60">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        style.bar
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Total footer */}
            <div className="mt-2 border-t pt-2 flex justify-between text-xs text-muted-foreground">
              <span>Total (sampled)</span>
              <span className="tabular-nums font-medium text-foreground">
                {total.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
