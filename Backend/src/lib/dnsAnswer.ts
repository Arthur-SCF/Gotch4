/**
 * Answer planning for the DNS rebinding engine — the VPS/local-controller half of
 * the canonical engine (parsing lives in dnsEngine.ts). Vendored byte-identical
 * into VPS-DNS-Server/ alongside dnsEngine.ts.
 *
 * Security: rb-/ip- directives are only honoured when their truncated HMAC (keyed
 * on the shared secret) validates. An invalid/forged directive falls back to a
 * benign capture answer, so the server can never be abused as an open rebinder.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  assertNever,
  type InteractionName,
  ipv4ToHexDword,
  parseInteractionName,
  type RebindStrategy,
} from "./dnsEngine.ts";

export const MAC_LENGTH = 8;

export type DnsRecord =
  | { readonly type: "A"; readonly ip: string }
  | { readonly type: "TXT"; readonly text: string };

export type DnsAnswerPlan =
  | { readonly kind: "nxdomain" }
  | { readonly kind: "nodata" }
  | { readonly kind: "records"; readonly records: readonly DnsRecord[] };

export type AnswerResult = {
  readonly plan: DnsAnswerPlan;
  readonly token: string | null;
  readonly strategy: RebindStrategy | null;
  readonly summary: string;
};

export type PlanAnswerInput = {
  readonly fqdn: string;
  readonly qtype: string;
  readonly baseDomain: string;
  readonly defaultIp: string;
  readonly secret: string;
  readonly txtValue: string;
  readonly resolverIp?: string;
};

function directiveMessage(parsed: InteractionName): string | null {
  switch (parsed.kind) {
    case "rebind":
      return `rb:${ipv4ToHexDword(parsed.ipA)}:${ipv4ToHexDword(parsed.ipB)}:${parsed.strategy}`;
    case "embed":
      return `ip:${ipv4ToHexDword(parsed.ip)}`;
    case "capture":
    case "none":
      return null;
    default:
      return assertNever(parsed);
  }
}

/** Truncated hex HMAC-SHA256 over a directive message. */
export function computeMac(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex").slice(0, MAC_LENGTH);
}

function macsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** True only if the parsed directive carries a valid HMAC for the shared secret. */
export function verifyInteractionMac(
  parsed: InteractionName,
  secret: string,
): boolean {
  const message = directiveMessage(parsed);
  if (message === null) return false;
  const mac = parsed.kind === "rebind" || parsed.kind === "embed" ? parsed.mac : "";
  return macsEqual(mac.toLowerCase(), computeMac(message, secret));
}

export function buildRebindLabel(
  ipA: string,
  ipB: string,
  strategy: RebindStrategy,
  token: string,
  secret: string,
): string {
  const hexA = ipv4ToHexDword(ipA);
  const hexB = ipv4ToHexDword(ipB);
  const mac = computeMac(`rb:${hexA}:${hexB}:${strategy}`, secret);
  return `rb-${hexA}-${hexB}-${strategy}-${mac}-${token}`;
}

export function buildEmbedLabel(ip: string, token: string, secret: string): string {
  const hex = ipv4ToHexDword(ip);
  const mac = computeMac(`ip:${hex}`, secret);
  return `ip-${hex}-${mac}-${token}`;
}

export type RebindContext = {
  readonly strategy: RebindStrategy;
  readonly ipA: string;
  readonly ipB: string;
  readonly token: string;
  readonly qtype: string;
  readonly resolverIp: string;
};

const REBIND_STATE_TTL_MS = 10 * 60 * 1000;
const REBIND_STATE_MAX = 10_000;
const REBIND_DEDUP_MS = 200;
const EVICT_INTERVAL_MS = 60 * 1000;

type RebindEntry = {
  count: number;
  firstSeenAt: number;
  lastDedupKey: string;
  lastAt: number;
};

// Per-process rebind counters, keyed by correlation token. Each DNS server owns
// its own store — a payload is only ever resolved by one server, so no sharing.
const rebindState = new Map<string, RebindEntry>();
let lastEvictAt = 0;

function evictStale(now: number): void {
  if (now - lastEvictAt < EVICT_INTERVAL_MS) return;
  lastEvictAt = now;
  for (const [key, entry] of rebindState) {
    if (now - entry.firstSeenAt > REBIND_STATE_TTL_MS) rebindState.delete(key);
  }
}

// Advance the per-token query counter. Identical (qtype, resolver) queries inside
// REBIND_DEDUP_MS are treated as one, so a resolver retransmit can't spuriously flip.
function advanceRebindCount(token: string, dedupKey: string, now: number): number {
  evictStale(now);
  const entry = rebindState.get(token);
  if (!entry) {
    if (rebindState.size >= REBIND_STATE_MAX) {
      const oldest = rebindState.keys().next().value;
      if (oldest !== undefined) rebindState.delete(oldest);
    }
    rebindState.set(token, { count: 1, firstSeenAt: now, lastDedupKey: dedupKey, lastAt: now });
    return 1;
  }
  if (entry.lastDedupKey === dedupKey && now - entry.lastAt < REBIND_DEDUP_MS) {
    entry.lastAt = now;
    return entry.count;
  }
  entry.count += 1;
  entry.lastDedupKey = dedupKey;
  entry.lastAt = now;
  return entry.count;
}

/** For tests: reset the per-process rebind counters. */
export function resetRebindState(): void {
  rebindState.clear();
  lastEvictAt = 0;
}

/**
 * Choose which IP(s) to return for a rebind directive.
 * `ma` returns both (browser pool-failover); `rd` returns a random one; `fs` returns
 * the benign ipA on the first query then the target ipB; `rr` alternates each query.
 */
export function resolveRebindIps(ctx: RebindContext): readonly string[] {
  switch (ctx.strategy) {
    case "ma":
      return [ctx.ipA, ctx.ipB];
    case "rd":
      return [Math.random() < 0.5 ? ctx.ipA : ctx.ipB];
    case "fs": {
      const n = advanceRebindCount(ctx.token, `${ctx.qtype}|${ctx.resolverIp}`, Date.now());
      return [n <= 1 ? ctx.ipA : ctx.ipB];
    }
    case "rr": {
      const n = advanceRebindCount(ctx.token, `${ctx.qtype}|${ctx.resolverIp}`, Date.now());
      return [n % 2 === 1 ? ctx.ipA : ctx.ipB];
    }
    default:
      return assertNever(ctx.strategy);
  }
}

function records(list: readonly DnsRecord[]): DnsAnswerPlan {
  return { kind: "records", records: list };
}

export function planAnswer(input: PlanAnswerInput): AnswerResult {
  const parsed = parseInteractionName(input.fqdn, input.baseDomain);
  const qtype = input.qtype.toUpperCase();

  if (parsed.kind === "none") {
    return { plan: { kind: "nxdomain" }, token: null, strategy: null, summary: "NXDOMAIN" };
  }

  const token = parsed.token;
  const authorized =
    (parsed.kind === "rebind" || parsed.kind === "embed") &&
    verifyInteractionMac(parsed, input.secret);

  if (parsed.kind === "rebind" && authorized) {
    if (qtype === "A") {
      const ips = resolveRebindIps({
        strategy: parsed.strategy,
        ipA: parsed.ipA,
        ipB: parsed.ipB,
        token: parsed.token,
        qtype,
        resolverIp: input.resolverIp ?? "unknown",
      });
      return {
        plan: records(ips.map((ip) => ({ type: "A", ip }))),
        token,
        strategy: parsed.strategy,
        summary: ips.join(","),
      };
    }
    return { plan: { kind: "nodata" }, token, strategy: parsed.strategy, summary: "NODATA" };
  }

  if (parsed.kind === "embed" && authorized) {
    if (qtype === "A") {
      return { plan: records([{ type: "A", ip: parsed.ip }]), token, strategy: null, summary: parsed.ip };
    }
    return { plan: { kind: "nodata" }, token, strategy: null, summary: "NODATA" };
  }

  // Capture — and the benign fallback for an unauthorized rb-/ip- directive.
  if (qtype === "A") {
    return { plan: records([{ type: "A", ip: input.defaultIp }]), token, strategy: null, summary: input.defaultIp };
  }
  if (qtype === "TXT") {
    return { plan: records([{ type: "TXT", text: input.txtValue }]), token, strategy: null, summary: "TXT" };
  }
  return { plan: { kind: "nodata" }, token, strategy: null, summary: "NODATA" };
}
