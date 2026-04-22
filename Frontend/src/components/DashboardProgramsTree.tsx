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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import {
  IconRadar,
  IconFolder,
  IconArchive,
  IconExternalLink,
  IconStar,
  IconKey,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface Program {
  id: number;
  name: string;
  status: string;
  isFavorite: boolean;
  _count: { events: number; files: number; payloads: number };
  updatedAt: string;
}

// ─── Resource config ──────────────────────────────────────────────────────────

const RESOURCES = [
  {
    key: "events" as const,
    label: "Events",
    icon: IconRadar,
    chipClass:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50",
  },
  {
    key: "files" as const,
    label: "Files",
    icon: IconFolder,
    chipClass:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/50",
  },
  {
    key: "payloads" as const,
    label: "Payloads",
    icon: IconArchive,
    chipClass:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/50",
  },
] as const;

const STATUS_CONFIG: Record<string, { badge: string }> = {
  active: {
    badge: "border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400",
  },
  paused: {
    badge: "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400",
  },
  completed: {
    badge: "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400",
  },
  archived: {
    badge: "border-border text-muted-foreground",
  },
};

// ─── Tree ─────────────────────────────────────────────────────────────────────

const ITEM_H = 36;

// React.memo: props are stable references — skip re-render when parent updates activeIdx
const ProgramTree = React.memo(function ProgramTree({
  program,
  grabKeyCount,
}: {
  program: Program;
  grabKeyCount: number;
}) {
  const resources = RESOURCES.filter((r) => program._count[r.key] > 0);
  const hasGrabKeys = grabKeyCount > 0;
  const totalBranches = resources.length + (hasGrabKeys ? 1 : 0);

  if (totalBranches === 0) {
    return (
      <p className="text-xs text-muted-foreground/40 italic">
        No linked resources yet
      </p>
    );
  }

  return (
    <div className="flex items-center">
      <div className="size-2.5 shrink-0 rounded-full bg-primary/50 ring-[3px] ring-primary/15" />
      <div className="w-5 h-px bg-border/60 shrink-0" />
      <div className="relative flex flex-col" style={{ height: totalBranches * ITEM_H }}>
        {totalBranches > 1 && (
          <div
            className="absolute left-0 w-px bg-border/60"
            style={{ top: ITEM_H / 2, height: (totalBranches - 1) * ITEM_H }}
          />
        )}

        {resources.map((res) => {
          const Icon = res.icon;
          const count = program._count[res.key];
          return (
            <div key={res.key} className="relative flex items-center" style={{ height: ITEM_H }}>
              <div className="w-5 h-px bg-border/60 shrink-0" />
              <div className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap select-none", res.chipClass)}>
                <Icon className="size-3 shrink-0" />
                <span className="tabular-nums font-bold">{count.toLocaleString()}</span>
                <span className="opacity-60 font-normal">{res.label}</span>
              </div>
            </div>
          );
        })}

        {hasGrabKeys && (
          <div className="relative flex items-center" style={{ height: ITEM_H }}>
            <div className="w-5 h-px bg-border/60 shrink-0" />
            <div className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap select-none bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200/50 dark:border-violet-800/50">
              <IconKey className="size-3 shrink-0" />
              <span className="tabular-nums font-bold">{grabKeyCount}</span>
              <span className="opacity-60 font-normal">Grab Key{grabKeyCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// React.memo: prevents re-render on every setActiveIdx call — program/grabKeyCount are stable
const ProgramSquare = React.memo(function ProgramSquare({
  program,
  grabKeyCount,
}: {
  program: Program;
  grabKeyCount: number;
}) {
  const cfg = STATUS_CONFIG[program.status] ?? STATUS_CONFIG.archived;
  const totalResources =
    program._count.events + program._count.files + program._count.payloads + grabKeyCount;

  return (
    <div className="group relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative size-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary select-none">
              {program.name.charAt(0).toUpperCase()}
              {program.isFavorite && (
                <IconStar className="absolute -top-1 -right-1 size-3 fill-amber-400 text-amber-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{program.name}</p>
              <Badge
                variant="outline"
                className={cn("mt-0.5 h-auto px-1.5 py-0 text-[10px] leading-[14px] capitalize", cfg.badge)}
              >
                {program.status}
              </Badge>
            </div>
          </div>
          <Link to="/programs">
            <IconExternalLink className="size-3.5 mt-0.5 shrink-0 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors" />
          </Link>
        </div>

        <div className="flex flex-1 items-center">
          <ProgramTree program={program} grabKeyCount={grabKeyCount} />
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
          <span>{totalResources} linked resource{totalResources !== 1 ? "s" : ""}</span>
          <span>
            {new Date(program.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

const CARD_W = 200;
const CARD_GAP = 12;
const STEP = CARD_W + CARD_GAP;

export function DashboardProgramsTree() {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [sidePad, setSidePad] = React.useState<number | null>(null);

  const programsRef = React.useRef<Program[]>([]);
  const initializedRef = React.useRef(false);
  const momentumRef = React.useRef({ velocity: 0, rafId: 0 });
  const snapRafRef = React.useRef(0);
  // Prevents handleScroll (native listener) from cancelling our own snap animation.
  // animateTo writes el.scrollLeft which fires scroll events — we must ignore those.
  const isAnimating = React.useRef(false);
  const settleTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Card style update — direct DOM, no React involvement ───────────────────
  // Invariant: with paddingLeft = paddingRight = (containerWidth - CARD_W) / 2,
  // card j is centered when scrollLeft = j * STEP, so distance from center = i*STEP - scrollLeft.
  const updateCardStyles = React.useCallback((scrollLeft: number) => {
    const refs = cardRefs.current;
    for (let i = 0; i < refs.length; i++) {
      const card = refs[i];
      if (!card) continue;
      const offset = i * STEP - scrollLeft;
      const t = Math.min(1, Math.abs(offset) / STEP);
      card.style.transform = `scale(${1 - t * 0.07})`;
      card.style.opacity = String(1 - t * 0.4);
    }
  }, []);

  // ── Custom snap animation — ease-out cubic via rAF ─────────────────────────
  // Same animation system as scroll/momentum: one continuous motion, no seam.
  const animateTo = React.useCallback((target: number) => {
    const el = scrollRef.current;
    if (!el) return;

    cancelAnimationFrame(snapRafRef.current);

    const from = el.scrollLeft;
    const distance = target - from;
    if (Math.abs(distance) < 0.5) {
      el.scrollLeft = target;
      updateCardStyles(target);
      return;
    }

    const duration = Math.min(350, Math.max(120, Math.abs(distance) * 0.6));
    const startTime = performance.now();
    isAnimating.current = true;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const newLeft = from + distance * eased;
      el.scrollLeft = newLeft;
      updateCardStyles(newLeft);

      if (progress < 1) {
        snapRafRef.current = requestAnimationFrame(tick);
      } else {
        el.scrollLeft = target;
        updateCardStyles(target);
        isAnimating.current = false;
      }
    };

    snapRafRef.current = requestAnimationFrame(tick);
  }, [updateCardStyles]);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-programs", { limit: 100 }],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/programs?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch programs");
      return res.json() as Promise<{ data: Program[]; pagination: { total: number } }>;
    },
    refetchInterval: 60_000,
  });

  const { data: grabMetasData } = useQuery({
    queryKey: ["grab-metas"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/grab/metas`);
      if (!res.ok) throw new Error("Failed to fetch grab metas");
      return res.json() as Promise<Record<string, { programId: number | null }>>;
    },
    refetchInterval: 60_000,
  });

  const grabKeysByProgram = React.useMemo(() => {
    const counts: Record<number, number> = {};
    if (!grabMetasData) return counts;
    for (const meta of Object.values(grabMetasData)) {
      if (meta.programId != null) {
        counts[meta.programId] = (counts[meta.programId] ?? 0) + 1;
      }
    }
    return counts;
  }, [grabMetasData]);

  const programs = React.useMemo(
    () =>
      [...(data?.data ?? [])].sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        return b._count.events - a._count.events;
      }),
    [data]
  );

  React.useEffect(() => { programsRef.current = programs; }, [programs]);

  // Triple-clone for infinite loop: [clone-left | real | clone-right]
  const allCards = React.useMemo(
    () => [...programs, ...programs, ...programs],
    [programs]
  );

  // ── Center-focus padding ────────────────────────────────────────────────────
  // Deps include programs.length: on page refresh, isLoading is true at mount so the
  // carousel div doesn't exist yet (scrollRef is null). The effect must re-run once
  // the carousel actually renders (programs loaded → length > 0).
  const carouselVisible = !isLoading && programs.length > 0;
  React.useEffect(() => {
    if (!carouselVisible) return;
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setSidePad(Math.max(0, (el.clientWidth - CARD_W) / 2));
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, [carouselVisible]);

  // ── Initialize scroll at center of middle set ───────────────────────────────
  React.useEffect(() => {
    const el = scrollRef.current;
    const n = programs.length;
    if (!el || n === 0 || sidePad === null) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    el.scrollLeft = n * STEP;
    updateCardStyles(el.scrollLeft);
  }, [programs.length, sidePad, updateCardStyles]);

  React.useEffect(() => {
    if (programs.length > 0 && initializedRef.current) {
      updateCardStyles(scrollRef.current?.scrollLeft ?? 0);
    }
  }, [programs, updateCardStyles]);

  // ── Settle — normalize to middle set + snap ─────────────────────────────────
  const settle = React.useCallback(() => {
    const el = scrollRef.current;
    const n = programsRef.current.length;
    if (!el || n === 0) return;

    const raw = el.scrollLeft;
    let cardIdx = Math.round(raw / STEP);

    if (cardIdx < n) cardIdx += n;
    else if (cardIdx >= 2 * n) cardIdx -= n;

    const targetLeft = cardIdx * STEP;

    if (Math.abs(raw - targetLeft) > STEP) {
      // Clone zone — instant teleport, no visual jump (clones are identical)
      el.scrollLeft = targetLeft;
      updateCardStyles(targetLeft);
    } else {
      animateTo(targetLeft);
    }

    setActiveIdx(cardIdx % n);
  }, [animateTo, updateCardStyles]);

  // ── All scroll/wheel handling in one native-listener effect ─────────────────
  // Native listeners bypass React's synthetic event system (overhead on every tick).
  // isMomentumRunning is a closure variable — avoids a ref + guards the scroll
  // handler from doing redundant work while our rAF momentum loop is running.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let isMomentumRunning = false;

    // Native scroll listener — handles touch/pointer drag only.
    // Guards: skip during our own animateTo (isAnimating) or rAF momentum (isMomentumRunning).
    const onScroll = () => {
      if (isAnimating.current || isMomentumRunning) return;
      updateCardStyles(el.scrollLeft);
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(settle, 150);
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();

      // Kill any in-flight snap
      cancelAnimationFrame(snapRafRef.current);
      isAnimating.current = false;
      isMomentumRunning = false;

      if (e.deltaMode === 0) {
        // ── Trackpad ──────────────────────────────────────────────────────────
        el.scrollLeft += e.deltaY;
        updateCardStyles(el.scrollLeft);
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(settle, 150);
      } else {
        // ── Mouse wheel — momentum via rAF ────────────────────────────────────
        cancelAnimationFrame(momentumRef.current.rafId);
        momentumRef.current.velocity = Math.max(
          -600,
          Math.min(600, momentumRef.current.velocity + e.deltaY * 1.2)
        );

        // Read scrollLeft once — track locally to avoid forced layout reads per frame
        let currentLeft = el.scrollLeft;
        isMomentumRunning = true;

        const tick = () => {
          const v = momentumRef.current.velocity;
          if (Math.abs(v) < 0.8) {
            momentumRef.current.velocity = 0;
            isMomentumRunning = false;
            settle();
            return;
          }
          currentLeft += v;
          el.scrollLeft = currentLeft; // write only — no read
          updateCardStyles(currentLeft);
          momentumRef.current.velocity *= 0.87;
          momentumRef.current.rafId = requestAnimationFrame(tick);
        };

        momentumRef.current.rafId = requestAnimationFrame(tick);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
    };
  }, [settle, updateCardStyles, carouselVisible]);

  // ── Dot click ───────────────────────────────────────────────────────────────
  const scrollToCard = React.useCallback((idx: number) => {
    const n = programsRef.current.length;
    if (!scrollRef.current || n === 0) return;
    animateTo((n + idx) * STEP);
    setActiveIdx(idx);
  }, [animateTo]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle>Programs</CardTitle>
          <Link to="/programs">
            <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              View all
              <IconExternalLink className="size-3" />
            </span>
          </Link>
        </div>
        <CardDescription>
          {isLoading
            ? "Loading…"
            : `${programs.length} program${programs.length === 1 ? "" : "s"}`}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden gap-0">
        {isLoading ? (
          <div className="flex gap-3 pl-6 pr-4 pb-4 pt-1">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="shrink-0 rounded-xl" style={{ width: CARD_W, height: CARD_W }} />
            ))}
          </div>
        ) : programs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground px-6 py-8">
            <div className="text-center">
              <p className="mb-1">No programs yet</p>
              <Link to="/programs">
                <span className="text-xs text-primary hover:underline">Create your first program →</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* No onScroll — using native listener to bypass React's event system */}
            <div
              ref={scrollRef}
              className="flex flex-row gap-3 overflow-x-auto pt-1 pb-3"
              style={{
                scrollbarWidth: "none",
                paddingLeft: sidePad ?? 0,
                paddingRight: sidePad ?? 0,
              }}
            >
              {allCards.map((program, i) => (
                <div
                  key={`${program.id}-${i}`}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  className="shrink-0"
                  style={{
                    width: CARD_W,
                    height: CARD_W,
                    willChange: "transform, opacity",
                    transformOrigin: "center center",
                  }}
                >
                  <ProgramSquare
                    program={program}
                    grabKeyCount={grabKeysByProgram[program.id] ?? 0}
                  />
                </div>
              ))}
            </div>

            <div className="shrink-0 flex items-center justify-center gap-1.5 py-2">
              {programs.map((_, i) => (
                <button
                  key={i}
                  onClick={() => scrollToCard(i)}
                  className={cn(
                    "rounded-full transition-all duration-200",
                    i === activeIdx
                      ? "w-4 h-1.5 bg-primary"
                      : "size-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/50"
                  )}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
