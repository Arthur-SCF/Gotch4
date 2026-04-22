import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Event {
  id: number;
  type?: string;
  createdAt: string;
}

interface EzCapture {
  id: number;
  createdAt: string;
}

const chartConfig = {
  http: {
    label: "HTTP",
    color: "var(--primary)",
  },
  dns: {
    label: "DNS",
    color: "var(--color-chart-2, oklch(0.6 0.2 280))",
  },
  ez: {
    label: "ezXSS",
    color: "oklch(0.65 0.24 7.5)",
  },
} satisfies ChartConfig;

function buildChartData(events: Event[], ezCaptures: EzCapture[], days: number) {
  const now = new Date();
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const dateKey = day.toISOString().split("T")[0];
    const dayEvents = events.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= day.getTime() && t < nextDay.getTime();
    });
    const dayEz = ezCaptures.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= day.getTime() && t < nextDay.getTime();
    });

    result.push({
      date: dateKey,
      http: dayEvents.filter((e) => e.type !== "dns").length,
      dns: dayEvents.filter((e) => e.type === "dns").length,
      ez: dayEz.length,
    });
  }

  return result;
}

export function DashboardEventsChart() {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState("30d");

  React.useEffect(() => {
    if (isMobile) setTimeRange("7d");
  }, [isMobile]);

  const days = timeRange === "90d" ? 90 : timeRange === "30d" ? 30 : 7;

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

  const { data: ezData, isLoading: isLoadingEz } = useQuery({
    queryKey: ["dashboard-ez", { limit: 500 }],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/ez?limit=500`);
      if (!res.ok) throw new Error("Failed to fetch ez captures");
      return res.json() as Promise<{
        data: EzCapture[];
        pagination: { total: number };
      }>;
    },
    refetchInterval: 30_000,
  });

  const chartData = React.useMemo(
    () => buildChartData(eventsData?.data ?? [], ezData?.data ?? [], days),
    [eventsData, ezData, days]
  );

  const totalHttp = chartData.reduce((s, d) => s + d.http, 0);
  const totalDns = chartData.reduce((s, d) => s + d.dns, 0);
  const totalEz = chartData.reduce((s, d) => s + d.ez, 0);

  return (
    <Card className="@container/card h-full">
      <CardHeader>
        <CardTitle>Capture Activity</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            HTTP, DNS &amp; ezXSS captures over the selected period
          </span>
          <span className="@[540px]/card:hidden">Captures over time</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(v) => v && setTimeRange(v)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-3 @[540px]/card:flex"
          >
            <ToggleGroupItem value="7d">7d</ToggleGroupItem>
            <ToggleGroupItem value="30d">30d</ToggleGroupItem>
            <ToggleGroupItem value="90d">90d</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-28 @[540px]/card:hidden"
              size="sm"
              aria-label="Select time range"
            >
              <SelectValue placeholder="Last 30 days" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="7d" className="rounded-lg">Last 7 days</SelectItem>
              <SelectItem value="30d" className="rounded-lg">Last 30 days</SelectItem>
              <SelectItem value="90d" className="rounded-lg">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>

      <CardContent className="px-2 pt-2 sm:px-6">
        {/* Totals summary */}
        <div className="mb-4 flex gap-4 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {totalHttp.toLocaleString()}
            </span>{" "}
            HTTP
          </span>
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {totalDns.toLocaleString()}
            </span>{" "}
            DNS
          </span>
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {totalEz.toLocaleString()}
            </span>{" "}
            XSS
          </span>
        </div>

        {isLoading || isLoadingEz ? (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
            <AreaChart data={chartData} margin={{ left: 0, right: 0 }}>
              <defs>
                <linearGradient id="fillHttp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-http)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-http)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillDns" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-dns)" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="var(--color-dns)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillEz" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-ez)" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="var(--color-ez)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={days <= 7 ? 0 : 24}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={28}
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) =>
                      new Date(v).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    }
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="ez"
                type="monotone"
                fill="url(#fillEz)"
                stroke="var(--color-ez)"
                strokeWidth={1.5}
                stackId="a"
              />
              <Area
                dataKey="dns"
                type="monotone"
                fill="url(#fillDns)"
                stroke="var(--color-dns)"
                strokeWidth={1.5}
                stackId="a"
              />
              <Area
                dataKey="http"
                type="monotone"
                fill="url(#fillHttp)"
                stroke="var(--color-http)"
                strokeWidth={2}
                stackId="a"
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
