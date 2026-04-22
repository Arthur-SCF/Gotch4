import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconCopy,
  IconCheck,
  IconRefresh,
  IconTrash,
  IconPlayerPlay,
  IconFingerprint,
  IconClock,
  IconBraces,
  IconDice,
  IconPalette,
  IconCircleCheck,
  IconCircleX,
  IconArrowBack,
  IconCalendar,
} from "@tabler/icons-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useCopyButton } from "@/hooks/useCopyButton";
import { useTheme } from "@/components/ThemeProvider";

// ==================== JSON HIGHLIGHTER ====================

type JTokType = "key" | "string" | "number" | "boolean" | "null" | "punct" | "other";

function tokenizeJson(json: string): { type: JTokType; val: string }[] {
  const re =
    /("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false|null)|([{}\[\]:,])|(\s+)|(.)/g;
  const out: { type: JTokType; val: string }[] = [];
  for (const m of json.matchAll(re)) {
    const afterPos = m.index! + m[0].length;
    if (m[1] !== undefined) {
      const rest = json.slice(afterPos).trimStart();
      out.push({ type: rest.startsWith(":") ? "key" : "string", val: m[1] });
    } else if (m[2] !== undefined) {
      out.push({ type: "number", val: m[2] });
    } else if (m[3] !== undefined) {
      out.push({ type: m[3] === "null" ? "null" : "boolean", val: m[3] });
    } else if (m[4] !== undefined) {
      out.push({ type: "punct", val: m[4] });
    } else {
      out.push({ type: "other", val: m[5] ?? m[6] ?? "" });
    }
  }
  return out;
}

const COLORS: Record<"dark" | "light", Record<JTokType, string>> = {
  dark: {
    key:     "#9cdcfe",
    string:  "#ce9178",
    number:  "#b5cea8",
    boolean: "#569cd6",
    null:    "#569cd6",
    punct:   "#d4d4d4",
    other:   "#d4d4d4",
  },
  light: {
    key:     "#0451a5",
    string:  "#a31515",
    number:  "#098658",
    boolean: "#0000ff",
    null:    "#0000ff",
    punct:   "#000000",
    other:   "#000000",
  },
};

function JsonHighlight({ code, mode }: { code: string; mode: "dark" | "light" }) {
  const tokens = useMemo(() => tokenizeJson(code), [code]);
  const palette = COLORS[mode];
  return (
    <div
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace",
        fontSize: "0.875rem",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        padding: "1em",
        borderRadius: "0.375rem",
        background: mode === "dark" ? "#1e1e1e" : "#ffffff",
        color: palette.other,
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      {tokens.map(({ type, val }, i) => (
        <span key={i} style={{ color: palette[type] }}>
          {val}
        </span>
      ))}
    </div>
  );
}

// ==================== UUID ====================

const UUID_NAMESPACES: Record<string, string> = {
  DNS: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  URL: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  OID: "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
  X500: "6ba7b814-9dad-11d1-80b4-00c04fd430c8",
};

function parseUUID(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  return Uint8Array.from({ length: 16 }, (_, i) =>
    parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  );
}

function bytesToUUID(b: Uint8Array): string {
  const h = Array.from(b).map((x) => x.toString(16).padStart(2, "0"));
  return (
    h.slice(0, 4).join("") +
    "-" + h.slice(4, 6).join("") +
    "-" + h.slice(6, 8).join("") +
    "-" + h.slice(8, 10).join("") +
    "-" + h.slice(10, 16).join("")
  );
}

function generateV1(): string {
  const EPOCH = BigInt("122192928000000000");
  const ts = BigInt(Date.now()) * BigInt(10000) + EPOCH;
  const tLow = Number(ts & BigInt(0xffffffff));
  const tMid = Number((ts >> BigInt(32)) & BigInt(0xffff));
  const tHiV = (Number((ts >> BigInt(48)) & BigInt(0x0fff))) | 0x1000;
  const clk = (crypto.getRandomValues(new Uint16Array(1))[0] & 0x3fff) | 0x8000;
  const node = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    tLow.toString(16).padStart(8, "0"),
    tMid.toString(16).padStart(4, "0"),
    tHiV.toString(16).padStart(4, "0"),
    clk.toString(16).padStart(4, "0"),
    node,
  ].join("-");
}

function generateV4(): string {
  return crypto.randomUUID();
}

async function generateV5(ns: string, name: string): Promise<string> {
  const nsBytes = parseUUID(ns);
  const nameBytes = new TextEncoder().encode(name);
  const combined = new Uint8Array(nsBytes.length + nameBytes.length);
  combined.set(nsBytes);
  combined.set(nameBytes, nsBytes.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", combined));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUUID(hash.slice(0, 16));
}

function generateV6(): string {
  const EPOCH = BigInt("122192928000000000");
  const ts = BigInt(Date.now()) * BigInt(10000) + EPOCH;
  const tH = Number((ts >> BigInt(28)) & BigInt(0xffffffff));
  const tM = Number((ts >> BigInt(12)) & BigInt(0xffff));
  const tLV = (Number(ts & BigInt(0x0fff))) | 0x6000;
  const clk = (crypto.getRandomValues(new Uint16Array(1))[0] & 0x3fff) | 0x8000;
  const node = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    tH.toString(16).padStart(8, "0"),
    tM.toString(16).padStart(4, "0"),
    tLV.toString(16).padStart(4, "0"),
    clk.toString(16).padStart(4, "0"),
    node,
  ].join("-");
}

function generateV7(): string {
  const ts = BigInt(Date.now());
  const msH = Number((ts >> BigInt(16)) & BigInt(0xffffffff));
  const msL = Number(ts & BigInt(0xffff));
  const randA = crypto.getRandomValues(new Uint16Array(1))[0] & 0x0fff;
  const variant =
    (crypto.getRandomValues(new Uint16Array(1))[0] & 0x3fff) | 0x8000;
  const randB = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    msH.toString(16).padStart(8, "0"),
    msL.toString(16).padStart(4, "0"),
    (0x7000 | randA).toString(16).padStart(4, "0"),
    variant.toString(16).padStart(4, "0"),
    randB,
  ].join("-");
}

function applyUUIDFormat(uuid: string, hyphens: boolean, upper: boolean): string {
  let r = uuid;
  if (!hyphens) r = r.replace(/-/g, "");
  if (upper) r = r.toUpperCase();
  return r;
}

const VERSION_DESCRIPTIONS: Record<string, string> = {
  v1: "Time-based. Uses current timestamp + random node (browser simulates MAC address).",
  v4: "Fully random. Most common version, cryptographically secure.",
  v5: "SHA-1 hash of namespace + name. Deterministic — same inputs always produce the same UUID.",
  v6: "Reordered time-based. Lexicographically sortable variant of v1.",
  v7: "Unix epoch ms + random. New standard (RFC 9562), time-ordered and sortable.",
};

function UUIDTab() {
  const [version, setVersion] = useState("v4");
  const [namespace, setNamespace] = useState("DNS");
  const [customNs, setCustomNs] = useState("");
  const [nsName, setNsName] = useState("");
  const [count, setCount] = useState(5);
  const [hyphens, setHyphens] = useState(true);
  const [upper, setUpper] = useState(false);
  const [uuids, setUuids] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { copy, isCopied } = useCopyButton();

  const needsNamespace = version === "v5";
  const isDeterministic = version === "v5";

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const ns =
        namespace === "Custom" ? customNs : UUID_NAMESPACES[namespace];
      const results: string[] = [];
      for (let i = 0; i < count; i++) {
        let raw: string;
        switch (version) {
          case "v1": raw = generateV1(); break;
          case "v4": raw = generateV4(); break;
          case "v5": raw = await generateV5(ns, nsName); break;
          case "v6": raw = generateV6(); break;
          case "v7": raw = generateV7(); break;
          default: raw = generateV4();
        }
        results.push(applyUUIDFormat(raw, hyphens, upper));
      }
      setUuids(results);
    } finally {
      setLoading(false);
    }
  }, [version, namespace, customNs, nsName, count, hyphens, upper]);

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4">
      {/* Controls */}
      <div className="w-full lg:w-60 shrink-0 flex flex-col gap-3 overflow-y-auto">
        <Card className="p-4 flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label>Version</Label>
            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="v1">v1 — Time-based</SelectItem>
                <SelectItem value="v4">v4 — Random</SelectItem>
                <SelectItem value="v5">v5 — SHA-1 Namespace</SelectItem>
                <SelectItem value="v6">v6 — Reordered Time</SelectItem>
                <SelectItem value="v7">v7 — Unix Epoch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsNamespace && (
            <>
              <div className="space-y-1.5">
                <Label>Namespace</Label>
                <Select value={namespace} onValueChange={setNamespace}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(UUID_NAMESPACES).map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                    <SelectItem value="Custom">Custom UUID</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {namespace === "Custom" && (
                <div className="space-y-1.5">
                  <Label>Namespace UUID</Label>
                  <Input
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={customNs}
                    onChange={(e) => setCustomNs(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  placeholder="example.com"
                  value={nsName}
                  onChange={(e) => setNsName(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Count (1–100)</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) =>
                setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="uuid-hyphens">Hyphens</Label>
              <Switch id="uuid-hyphens" checked={hyphens} onCheckedChange={setHyphens} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="uuid-upper">Uppercase</Label>
              <Switch id="uuid-upper" checked={upper} onCheckedChange={setUpper} />
            </div>
          </div>

          <Button onClick={generate} disabled={loading} className="w-full">
            <IconPlayerPlay className="size-4 mr-2" />
            {loading ? "Generating…" : "Generate"}
          </Button>
        </Card>

        <Card className="p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {VERSION_DESCRIPTIONS[version]}
          </p>
        </Card>
      </div>

      {/* Output */}
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-sm text-muted-foreground">
            {uuids.length > 0 ? `${uuids.length} UUIDs` : "Click Generate"}
            {isDeterministic && uuids.length > 1 && (
              <span className="ml-2 text-xs text-amber-500">(deterministic — all identical)</span>
            )}
          </span>
          {uuids.length > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(uuids.join("\n"), "uuids-all", "All UUIDs")}
              >
                {isCopied("uuids-all") ? (
                  <IconCheck className="size-4 mr-1" />
                ) : (
                  <IconCopy className="size-4 mr-1" />
                )}
                Copy All
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setUuids([])}>
                <IconTrash className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {uuids.length === 0 ? (
          <Card className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No UUIDs yet</p>
          </Card>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1">
            {uuids.map((uuid, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-muted/40 rounded px-3 py-2 font-mono text-sm group"
              >
                <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">
                  {i + 1}
                </span>
                <span className="flex-1 break-all select-all">{uuid}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copy(uuid, `uuid-${i}`, "UUID")}
                >
                  {isCopied(`uuid-${i}`) ? (
                    <IconCheck className="size-3.5" />
                  ) : (
                    <IconCopy className="size-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== TIMESTAMP ====================

interface TsFormat {
  key: string;
  label: string;
  desc: string;
  value: (d: Date) => string;
}

function localOffset(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const m = String(Math.abs(off) % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

const TS_FORMATS: TsFormat[] = [
  {
    key: "unix_s",
    label: "Unix (seconds)",
    desc: "Seconds since 1970-01-01T00:00:00Z",
    value: (d) => String(Math.floor(d.getTime() / 1000)),
  },
  {
    key: "unix_ms",
    label: "Unix (milliseconds)",
    desc: "Milliseconds since epoch",
    value: (d) => String(d.getTime()),
  },
  {
    key: "unix_us",
    label: "Unix (microseconds)",
    desc: "Approx. — JS Date precision is ms only",
    value: (d) => String(d.getTime() * 1000),
  },
  {
    key: "iso_utc",
    label: "ISO 8601 (UTC)",
    desc: "e.g. 2024-02-24T15:30:00.000Z",
    value: (d) => d.toISOString(),
  },
  {
    key: "iso_local",
    label: "ISO 8601 (Local)",
    desc: "With local timezone offset",
    value: (d) => {
      const local = new Date(
        d.getTime() - d.getTimezoneOffset() * 60000
      )
        .toISOString()
        .slice(0, 23);
      return `${local}${localOffset(d)}`;
    },
  },
  {
    key: "rfc2822",
    label: "RFC 2822",
    desc: "Email / SMTP date format",
    value: (d) => d.toUTCString().replace("GMT", "+0000"),
  },
  {
    key: "http",
    label: "HTTP Date (RFC 7231)",
    desc: "Used in HTTP headers (Date, Last-Modified, Expires)",
    value: (d) => d.toUTCString(),
  },
  {
    key: "sql",
    label: "SQL DateTime (UTC)",
    desc: "e.g. 2024-02-24 15:30:00",
    value: (d) => d.toISOString().replace("T", " ").slice(0, 19),
  },
  {
    key: "human",
    label: "Human Readable",
    desc: "Full locale string with timezone",
    value: (d) =>
      d.toLocaleString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      }),
  },
];

function TimestampTab() {
  const [live, setLive] = useState(true);
  const [displayDate, setDisplayDate] = useState(new Date());
  const [unixInput, setUnixInput] = useState(() =>
    String(Math.floor(Date.now() / 1000))
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { copy, isCopied } = useCopyButton();

  useEffect(() => {
    if (live) {
      const tick = () => {
        const now = new Date();
        setDisplayDate(now);
        setUnixInput(String(Math.floor(now.getTime() / 1000)));
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [live]);

  const stopLive = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setLive(false);
  }, []);

  const setDate = useCallback((d: Date) => {
    setDisplayDate(d);
    setUnixInput(String(Math.floor(d.getTime() / 1000)));
  }, []);

  const onUnixChange = (val: string) => {
    setUnixInput(val);
    const n = parseFloat(val);
    if (!isNaN(n) && val !== "") {
      const d = new Date(n > 1e12 ? n : n * 1000);
      if (!isNaN(d.getTime())) setDisplayDate(d);
    }
  };

  const timeValue =
    String(displayDate.getHours()).padStart(2, "0") +
    ":" +
    String(displayDate.getMinutes()).padStart(2, "0") +
    ":" +
    String(displayDate.getSeconds()).padStart(2, "0");

  return (
    <div className="flex flex-col gap-4">
      {/* Source */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex gap-2 items-start shrink-0">
            <Button
              size="sm"
              variant={live ? "default" : "outline"}
              onClick={() => setLive(true)}
            >
              <IconRefresh
                className={`size-4 mr-1 ${live ? "animate-spin [animation-duration:2s]" : ""}`}
              />
              Now
            </Button>
            <Button
              size="sm"
              variant={!live ? "default" : "outline"}
              onClick={stopLive}
            >
              Custom
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">
                Date & Time (local)
              </Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal text-sm"
                    onClick={stopLive}
                  >
                    <IconCalendar className="size-4 mr-2 text-muted-foreground shrink-0" />
                    {format(displayDate, "PPP, HH:mm:ss")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={displayDate}
                    onSelect={(date) => {
                      if (date) {
                        const d = new Date(date);
                        d.setHours(
                          displayDate.getHours(),
                          displayDate.getMinutes(),
                          displayDate.getSeconds()
                        );
                        setDate(d);
                      }
                    }}
                  />
                  <div className="border-t p-3 flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground shrink-0">
                      Time
                    </Label>
                    <Input
                      type="time"
                      step="1"
                      value={timeValue}
                      onChange={(e) => {
                        const parts = e.target.value.split(":").map(Number);
                        const d = new Date(displayDate);
                        d.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0);
                        setDate(d);
                      }}
                      className="font-mono text-sm"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">
                Unix timestamp (auto-detects s / ms)
              </Label>
              <Input
                placeholder="1708789200"
                value={unixInput}
                onChange={(e) => {
                  stopLive();
                  onUnixChange(e.target.value);
                }}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Format rows */}
      <div className="space-y-1.5">
        {TS_FORMATS.map((fmt) => {
          const val = fmt.value(displayDate);
          return (
            <div
              key={fmt.key}
              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-muted/40 rounded-md px-3 py-2.5 group"
            >
              <div className="sm:w-40 sm:shrink-0">
                <p className="text-xs font-medium">{fmt.label}</p>
                <p className="text-xs text-muted-foreground hidden sm:block leading-tight">
                  {fmt.desc}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <code className="flex-1 text-xs sm:text-sm font-mono break-all select-all">
                  {val}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copy(val, `ts-${fmt.key}`, fmt.label)}
                >
                  {isCopied(`ts-${fmt.key}`) ? (
                    <IconCheck className="size-3.5" />
                  ) : (
                    <IconCopy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== JSON ====================

function JSONTab() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [indent, setIndent] = useState("2");
  const [colored, setColored] = useState(false);
  const [outputIsJson, setOutputIsJson] = useState(false);
  const { copy, isCopied } = useCopyButton();
  const { mode } = useTheme();

  // Real-time validity with line/col extraction
  const jsonStatus = useMemo(() => {
    if (!input.trim()) return { valid: null as null };
    try {
      JSON.parse(input);
      return { valid: true as const };
    } catch (e) {
      const raw = (e as Error).message;
      let line: number | undefined;
      let col: number | undefined;

      // V8/Chrome: "...in JSON at position 15"
      const posMatch = raw.match(/at position (\d+)/i);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const before = input.slice(0, pos);
        const lines = before.split("\n");
        line = lines.length;
        col = lines[lines.length - 1].length + 1;
      }

      // Firefox: "at line 3 column 5"
      const ffMatch = raw.match(/at line (\d+) column (\d+)/i);
      if (ffMatch && !posMatch) {
        line = parseInt(ffMatch[1]);
        col = parseInt(ffMatch[2]);
      }

      // Clean up message — strip engine prefix and position suffix
      const msg = raw
        .replace(/^(JSON\.parse|SyntaxError):\s*/i, "")
        .replace(/,?\s*"[^"]*" is not valid JSON/, "")
        .replace(/\s*at position \d+/, "")
        .replace(/\s*at line \d+ column \d+ of the JSON data/, "")
        .trim();

      return { valid: false as const, line, col, msg };
    }
  }, [input]);

  const run = (action: "format" | "minify" | "escape" | "unescape") => {
    setError(null);

    if (action === "escape") {
      const escaped = input
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, (c) =>
          "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
        );
      setOutput(`"${escaped}"`);
      setOutputIsJson(true);
      return;
    }

    if (action === "unescape") {
      try {
        const trimmed = input.trim();
        const unescaped =
          trimmed.startsWith('"') && trimmed.endsWith('"')
            ? (JSON.parse(trimmed) as string)
            : (JSON.parse(`"${trimmed}"`) as string);
        setOutput(unescaped);
        setOutputIsJson(true);
      } catch (e) {
        setError((e as Error).message);
        setOutput("");
        setOutputIsJson(false);
      }
      return;
    }

    try {
      const parsed = JSON.parse(input);
      if (action === "format") {
        const sp = indent === "tab" ? "\t" : parseInt(indent);
        setOutput(JSON.stringify(parsed, null, sp));
        setOutputIsJson(true);
      } else if (action === "minify") {
        setOutput(JSON.stringify(parsed));
        setOutputIsJson(true);
      }
    } catch (e) {
      setError((e as Error).message);
      setOutput("");
      setOutputIsJson(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Input */}
        <div className="flex-1 flex flex-col gap-2 min-h-[180px] lg:min-h-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Label className="shrink-0">Input</Label>
              {jsonStatus.valid === true && (
                <IconCircleCheck className="size-4 text-green-500 shrink-0" />
              )}
              {jsonStatus.valid === false && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <IconCircleX className="size-4 text-destructive shrink-0" />
                  <span className="text-xs text-destructive truncate">
                    {jsonStatus.line
                      ? `Line ${jsonStatus.line}:${jsonStatus.col} — ${jsonStatus.msg}`
                      : jsonStatus.msg}
                  </span>
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!input}
              onClick={() => {
                setInput("");
                setOutput("");
                setError(null);
              }}
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'{"key": "value", "nested": {"a": 1}}'}
            className="flex-1 resize-none font-mono text-sm"
          />
        </div>

        {/* Controls + Output */}
        <div className="flex-1 flex flex-col gap-2 min-h-[180px] lg:min-h-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                Indent:
              </Label>
              <Select value={indent} onValueChange={setIndent}>
                <SelectTrigger className="w-[68px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="tab">Tab</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={() => run("format")}>
              Format
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("minify")}>
              Minify
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("escape")}>
              Escape String
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("unescape")}>
              Unescape String
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <Label>Output</Label>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={colored && outputIsJson ? "default" : "outline"}
                onClick={() => setColored((c) => !c)}
                title="Toggle syntax highlighting"
                disabled={!outputIsJson}
              >
                <IconPalette className="size-4 mr-1" />
                Colors
              </Button>
              {output && !error && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Move output to input"
                  onClick={() => {
                    setInput(output);
                    setOutput("");
                    setOutputIsJson(false);
                    setError(null);
                  }}
                >
                  <IconArrowBack className="size-4 mr-1" />
                  → Input
                </Button>
              )}
            {output && !error && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(output, "json-out", "Output")}
                >
                  {isCopied("json-out") ? (
                    <IconCheck className="size-4 mr-1" />
                  ) : (
                    <IconCopy className="size-4 mr-1" />
                  )}
                  Copy
                </Button>
              )}
            </div>
          </div>

          {error ? (
            <div className="flex-1 bg-destructive/10 border border-destructive/20 rounded-md p-3 overflow-auto">
              <p className="text-xs text-destructive font-mono whitespace-pre-wrap">
                {error}
              </p>
            </div>
          ) : colored && outputIsJson && output ? (
            <div className="flex-1 min-h-0 relative">
              <div className="absolute inset-0 overflow-y-auto rounded-md">
                <JsonHighlight code={output} mode={mode} />
              </div>
            </div>
          ) : (
            <Textarea
              value={output}
              readOnly
              placeholder="Output appears here…"
              className="flex-1 resize-none font-mono text-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== RANDOM ====================

const CHARSETS = {
  hex_lower: {
    label: "Hex (lowercase)",
    chars: "0123456789abcdef",
  },
  hex_upper: {
    label: "Hex (uppercase)",
    chars: "0123456789ABCDEF",
  },
  alphanumeric: {
    label: "Alphanumeric",
    chars: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  },
  base64url: {
    label: "Base64URL",
    chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
  },
  alpha: {
    label: "Alphabetic",
    chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  },
  numeric: {
    label: "Numeric",
    chars: "0123456789",
  },
} as const;

type CharsetKey = keyof typeof CHARSETS | "custom";

function randomString(length: number, charset: string): string {
  const arr = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(arr, (x) => charset[x % charset.length]).join("");
}

function RandomTab() {
  const [charset, setCharset] = useState<CharsetKey>("hex_lower");
  const [customChars, setCustomChars] = useState("");
  const [length, setLength] = useState(32);
  const [count, setCount] = useState(5);
  const [results, setResults] = useState<string[]>([]);
  const { copy, isCopied } = useCopyButton();

  const activeCharset =
    charset === "custom" ? customChars : CHARSETS[charset].chars;

  const generate = () => {
    if (!activeCharset) return;
    setResults(
      Array.from({ length: count }, () => randomString(length, activeCharset))
    );
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4">
      {/* Controls */}
      <div className="w-full lg:w-60 shrink-0 flex flex-col gap-3 overflow-y-auto">
        <Card className="p-4 flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label>Charset</Label>
            <Select
              value={charset}
              onValueChange={(v) => setCharset(v as CharsetKey)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(CHARSETS) as [
                    CharsetKey,
                    { label: string; chars: string },
                  ][]
                ).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {charset !== "custom" ? (
            <div className="bg-muted/50 rounded px-2 py-1.5">
              <p className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
                {CHARSETS[charset as keyof typeof CHARSETS].chars}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Characters</Label>
              <Input
                placeholder="abc0123!@#"
                value={customChars}
                onChange={(e) => setCustomChars(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {new Set(customChars).size} unique chars
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label>Length</Label>
              <span className="text-sm font-mono text-muted-foreground">
                {length}
              </span>
            </div>
            <Input
              type="number"
              min={1}
              max={512}
              value={length}
              onChange={(e) =>
                setLength(
                  Math.max(1, Math.min(512, parseInt(e.target.value) || 1))
                )
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Count (1–100)</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) =>
                setCount(
                  Math.max(1, Math.min(100, parseInt(e.target.value) || 1))
                )
              }
            />
          </div>

          <Button onClick={generate} disabled={!activeCharset} className="w-full">
            <IconPlayerPlay className="size-4 mr-2" />
            Generate
          </Button>
        </Card>
      </div>

      {/* Output */}
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-sm text-muted-foreground">
            {results.length > 0
              ? `${results.length} strings · length ${length}`
              : "Click Generate"}
          </span>
          {results.length > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(results.join("\n"), "rand-all", "All")}
              >
                {isCopied("rand-all") ? (
                  <IconCheck className="size-4 mr-1" />
                ) : (
                  <IconCopy className="size-4 mr-1" />
                )}
                Copy All
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResults([])}
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {results.length === 0 ? (
          <Card className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No strings yet</p>
          </Card>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1">
            {results.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-muted/40 rounded px-3 py-2 font-mono text-sm group"
              >
                <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">
                  {i + 1}
                </span>
                <span className="flex-1 break-all select-all">{s}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copy(s, `rand-${i}`, "String")}
                >
                  {isCopied(`rand-${i}`) ? (
                    <IconCheck className="size-3.5" />
                  ) : (
                    <IconCopy className="size-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== MAIN ====================

type Section = "uuid" | "timestamp" | "json" | "random";

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "uuid",      label: "UUID",      icon: IconFingerprint },
  { id: "timestamp", label: "Timestamp", icon: IconClock },
  { id: "json",      label: "JSON",      icon: IconBraces },
  { id: "random",    label: "Random",    icon: IconDice },
];

export default function UtilsHelper() {
  const [active, setActive] = useState<Section>("uuid");

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4">
      {/* Sidebar nav — horizontal on mobile, vertical on desktop */}
      <div className="w-full lg:w-44 shrink-0">
        <div className="flex flex-row lg:flex-col gap-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors w-full text-left",
                active === id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {active === "uuid"      && <UUIDTab />}
        {active === "timestamp" && (
          <div className="h-full overflow-y-auto">
            <TimestampTab />
          </div>
        )}
        {active === "json"      && <JSONTab />}
        {active === "random"    && <RandomTab />}
      </div>
    </div>
  );
}
