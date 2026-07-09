import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  IconCopy,
  IconCheck,
  IconArrowRight,
  IconWorld,
  IconWorldWww,
  IconServer,
  IconHash,
  IconClock,
  IconTag,
  IconNote,
  IconRoute,
  IconArrowsShuffle,
  IconCode,
} from "@tabler/icons-react";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { useCopyButton } from "@/hooks/useCopyButton";
import { cn } from "@/lib/utils";

export const REBIND_STRATEGY_LABELS = {
  fs: "First-then-second",
  ma: "Multiple-A",
  rr: "Round-robin",
  rd: "Random",
} as const;

export function rebindStrategyLabel(strategy: string | null): string | null {
  if (!strategy) return null;
  if (strategy in REBIND_STRATEGY_LABELS) {
    return REBIND_STRATEGY_LABELS[strategy as keyof typeof REBIND_STRATEGY_LABELS];
  }
  return strategy;
}

export interface DnsEvent {
  readonly id: number;
  readonly type?: string;
  readonly createdAt: string;
  readonly ipAddress: string | null;
  readonly programId: number | null;
  readonly notes: string | null;
  readonly correlationToken: string | null;
  readonly dnsQuery: string | null;
  readonly dnsType: string | null;
  readonly dnsAnswer: string | null;
  readonly dnsRebindStrategy: string | null;
}

interface CorrelatedEvent {
  readonly id: number;
  readonly type: "http" | "dns" | "ez";
  readonly createdAt: string;
  readonly method?: string | null;
  readonly path?: string | null;
  readonly fullUrl?: string | null;
  readonly host?: string | null;
  readonly ipAddress?: string | null;
  readonly dnsQuery?: string | null;
  readonly dnsType?: string | null;
  readonly dnsAnswer?: string | null;
}

interface Program {
  readonly id: number;
  readonly name: string;
}

interface DnsEventDetailProps {
  readonly event: DnsEvent | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly programs: readonly Program[];
}

type IconComponent = React.ComponentType<{ className?: string }>;

interface TimelineMeta {
  readonly Icon: IconComponent;
  readonly ring: string;
  readonly text: string;
}

const TIMELINE_META: Record<CorrelatedEvent["type"], TimelineMeta> = {
  dns: {
    Icon: IconWorld,
    ring: "border-sky-500/30 bg-sky-500/10",
    text: "text-sky-600 dark:text-sky-400",
  },
  http: {
    Icon: IconWorldWww,
    ring: "border-emerald-500/30 bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  ez: {
    Icon: IconCode,
    ring: "border-violet-500/30 bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
  },
};

function correlatedLabel(item: CorrelatedEvent): string {
  if (item.type === "dns") {
    return `DNS ${item.dnsType ?? ""} ${item.dnsQuery ?? ""}`.trim();
  }
  if (item.type === "ez") {
    return "XSS callback";
  }
  return `HTTP ${item.method ?? ""} ${item.path ?? item.fullUrl ?? ""}`.trim();
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: IconComponent;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  );
}

function CorrelationTimeline({ token }: { token: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dns-correlation", token],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/events/correlation/${token}`);
      if (!res.ok) throw new Error("Failed to fetch correlation");
      return res.json() as Promise<{ data: CorrelatedEvent[]; token: string }>;
    },
    enabled: token.length > 0,
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading correlated interactions…</p>;
  }

  const linked = data?.data ?? [];
  if (linked.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No correlated interactions found for this token yet.
      </p>
    );
  }

  return (
    <ol className="relative">
      {linked.map((item, idx) => {
        const meta = TIMELINE_META[item.type];
        const StepIcon = meta.Icon;
        const isLast = idx === linked.length - 1;
        const time = new Date(item.createdAt).toLocaleTimeString();
        return (
          <li key={`${item.type}-${item.id}`} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[13px] top-7 bottom-0 w-px bg-border"
              />
            )}
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
                <span className="font-mono text-xs break-all">{correlatedLabel(item)}</span>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{time}</span>
              </div>
              <span className={cn("text-[10px] font-medium uppercase tracking-wide", meta.text)}>
                {item.type}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DnsEventDetail({ event, open, onClose, programs }: DnsEventDetailProps) {
  const { copy, isCopied } = useCopyButton();

  if (!event) return null;

  const strategyLabel = rebindStrategyLabel(event.dnsRebindStrategy);
  const programName = event.programId
    ? programs.find((p) => p.id === event.programId)?.name ?? `Program #${event.programId}`
    : null;

  const hasAnswer = Boolean(event.dnsAnswer && event.dnsAnswer.trim());
  const answerText = hasAnswer ? (event.dnsAnswer ?? "") : "NODATA";
  const resolverText =
    event.ipAddress && event.ipAddress !== "unknown" ? event.ipAddress : "—";

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono uppercase gap-1">
              <IconWorld className="size-3" />
              {event.dnsType ?? "DNS"}
            </Badge>
            {strategyLabel && (
              <Badge variant="outline" className="font-mono gap-1 text-xs">
                <IconArrowsShuffle className="size-3" />
                {event.dnsRebindStrategy}
              </Badge>
            )}
          </div>
          <div className="flex items-start gap-2 min-w-0">
            <SheetTitle className="text-sm font-mono break-all leading-snug flex-1 min-w-0">
              {event.dnsQuery ?? "—"}
            </SheetTitle>
            {event.dnsQuery && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Copy query name"
                className="h-6 px-2 text-xs shrink-0"
                onClick={() => copy(event.dnsQuery ?? "", "query", "query name")}
              >
                {isCopied("query") ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <IconArrowRight className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground shrink-0">Answered</span>
            <span
              className={cn(
                "font-mono break-all",
                hasAnswer
                  ? "text-emerald-600 dark:text-emerald-400 font-medium"
                  : "text-muted-foreground",
              )}
            >
              {answerText}
            </span>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5 text-sm">
          <div
            className={cn(
              "rounded-lg border px-4 py-3",
              hasAnswer ? "border-emerald-500/30 bg-emerald-500/5" : "bg-muted/40",
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
              <IconArrowRight className="size-3" />
              Answer Returned
            </p>
            <p
              className={cn(
                "font-mono text-sm break-all",
                hasAnswer ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-muted-foreground",
              )}
            >
              {answerText}
            </p>
            {strategyLabel && (
              <p className="text-xs text-muted-foreground mt-1.5">
                via <span className="font-mono">{event.dnsRebindStrategy}</span> · {strategyLabel} rebinding
              </p>
            )}
          </div>

          <div className="space-y-3">
            <InfoRow icon={IconWorld} label="Record Type">
              <p className="font-mono text-xs">{event.dnsType ?? "—"}</p>
            </InfoRow>
            <InfoRow icon={IconServer} label="Resolver IP">
              <p className="font-mono text-xs">{resolverText}</p>
            </InfoRow>
          </div>

          {event.correlationToken && (
            <>
              <Separator />
              <InfoRow icon={IconHash} label="Correlation Token">
                <button
                  type="button"
                  aria-label="Copy correlation token"
                  onClick={() => copy(event.correlationToken ?? "", "token", "correlation token")}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 font-mono text-xs transition-colors hover:bg-muted"
                >
                  <span className="break-all">{event.correlationToken}</span>
                  {isCopied("token") ? (
                    <IconCheck className="size-3 shrink-0 text-emerald-500" />
                  ) : (
                    <IconCopy className="size-3 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </InfoRow>
            </>
          )}

          <Separator />

          <div className="space-y-3">
            <InfoRow icon={IconClock} label="Timestamp">
              <p className="text-xs">{new Date(event.createdAt).toLocaleString()}</p>
            </InfoRow>
            <InfoRow icon={IconTag} label="Program">
              {programName ? (
                <Badge variant="outline" className="text-xs">{programName}</Badge>
              ) : (
                <p className="text-xs text-muted-foreground">Unlinked</p>
              )}
            </InfoRow>
            {event.notes && (
              <InfoRow icon={IconNote} label="Notes">
                <p className="text-xs whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2">{event.notes}</p>
              </InfoRow>
            )}
          </div>

          {event.correlationToken && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
                  <IconRoute className="size-3.5 text-muted-foreground" />
                  Correlated Interactions
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Every DNS lookup and HTTP hit sharing this token, in chronological order — the
                  blind-SSRF confirmation story.
                </p>
              </div>
              <CorrelationTimeline token={event.correlationToken} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
