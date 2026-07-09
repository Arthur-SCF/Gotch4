/**
 * Canonical DNS interaction-name grammar for the blind-SSRF toolkit.
 *
 * SOURCE OF TRUTH. A byte-identical copy is vendored into `VPS-DNS-Server/`
 * (see GRAMMAR_VERSION + testVectors.json) so the DNS producer (VPS) and the
 * correlation-token parser (backend) never disagree. Pure + dependency-free
 * (Web Crypto global only) so it runs unchanged on both Bun runtimes.
 *
 * Grammar (the encoded label is the one immediately left of the base domain):
 *   capture:  <token>.<base>
 *   rebind:   rb-<hexIpA>-<hexIpB>-<strategy>-<hmac>-<token>.<base>
 *   embed:    ip-<hexIp>-<hmac>-<token>.<base>
 * where each hexIp is a big-endian IPv4 dword (8 lowercase hex), strategy is
 * fs|ma|rr|rd, and token is lowercase base32 (0x20-case-safe). HMAC verification
 * (the open-rebinder guard) happens at answer time in the engine's builder, not
 * here — this module only parses structure and extracts the correlation token.
 */

/** Bump when the grammar changes; surfaced in the VPS health check to detect drift. */
export const GRAMMAR_VERSION = 1;

export const REBIND_STRATEGIES = ["fs", "ma", "rr", "rd"] as const;
export type RebindStrategy = (typeof REBIND_STRATEGIES)[number];

/** Result of parsing a DNS query name against the configured base domain. */
export type InteractionName =
  | { readonly kind: "none" }
  | { readonly kind: "capture"; readonly token: string }
  | {
      readonly kind: "rebind";
      readonly token: string;
      readonly ipA: string;
      readonly ipB: string;
      readonly strategy: RebindStrategy;
      readonly mac: string;
    }
  | {
      readonly kind: "embed";
      readonly token: string;
      readonly ip: string;
      readonly mac: string;
    };

export class DnsGrammarError extends Error {
  readonly name = "DnsGrammarError";
}

const NONE: InteractionName = { kind: "none" };

// Minted tokens: 16 chars of RFC 4648 lowercase base32 (0x20-case-safe, DNS-label-safe).
const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const TOKEN_ALPHABET_SIZE = 32; // 256 % 32 === 0 → unbiased byte→symbol mapping
const TOKEN_LENGTH = 16;

// Reserved leftmost-label prefixes for the rebind/embed grammars. Minted tokens
// never start with these so a plain capture label can never look like a directive.
const RESERVED_PREFIXES = ["rb", "ip"] as const;

const REBIND_RE =
  /^rb-([0-9a-f]{8})-([0-9a-f]{8})-(fs|ma|rr|rd)-([0-9a-f]+)-([a-z2-7]+)$/;
const EMBED_RE = /^ip-([0-9a-f]{8})-([0-9a-f]+)-([a-z2-7]+)$/;

/** Mint a fresh per-payload correlation token. */
export function mintToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  for (;;) {
    crypto.getRandomValues(bytes);
    let out = "";
    for (const b of bytes) out += TOKEN_ALPHABET.charAt(b % TOKEN_ALPHABET_SIZE);
    if (!RESERVED_PREFIXES.some((p) => out.startsWith(p))) return out;
  }
}

/** Encode an IPv4 string as a big-endian hex dword (e.g. "127.0.0.1" → "7f000001"). */
export function ipv4ToHexDword(ip: string): string {
  const parts = ip.split(".");
  if (parts.length !== 4) throw new DnsGrammarError(`invalid IPv4: ${ip}`);
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      throw new DnsGrammarError(`invalid IPv4 octet in ${ip}`);
    }
    n = (n * 256 + octet) >>> 0;
  }
  return n.toString(16).padStart(8, "0");
}

/** Decode a big-endian hex dword back to an IPv4 string (e.g. "7f000001" → "127.0.0.1"). */
export function hexDwordToIpv4(hex: string): string {
  const n = Number.parseInt(hex, 16);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new DnsGrammarError(`invalid hex dword: ${hex}`);
  }
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join(
    ".",
  );
}

export function isRebindStrategy(value: unknown): value is RebindStrategy {
  return (
    typeof value === "string" &&
    (REBIND_STRATEGIES as readonly string[]).includes(value)
  );
}

function parseEncodedLabel(label: string): InteractionName {
  const rebind = REBIND_RE.exec(label);
  if (rebind) {
    const [, hexA, hexB, strat, mac, token] = rebind;
    if (hexA && hexB && strat && mac && token && isRebindStrategy(strat)) {
      return {
        kind: "rebind",
        ipA: hexDwordToIpv4(hexA),
        ipB: hexDwordToIpv4(hexB),
        strategy: strat,
        mac,
        token,
      };
    }
  }

  const embed = EMBED_RE.exec(label);
  if (embed) {
    const [, hex, mac, token] = embed;
    if (hex && mac && token) {
      return { kind: "embed", ip: hexDwordToIpv4(hex), mac, token };
    }
  }

  // Anything else under the base domain is opportunistic capture: the whole
  // leftmost-relevant label is the correlation token.
  return { kind: "capture", token: label };
}

/**
 * Parse a DNS query name (or HTTP Host) against the base domain. Lowercases to
 * survive DNS 0x20 case randomization, and requires a STRICT subdomain of base
 * (`x.base`, never `notbase`, never `base` itself).
 */
export function parseInteractionName(
  fqdn: string,
  baseDomain: string,
): InteractionName {
  const name = fqdn.trim().toLowerCase().replace(/\.$/, "");
  const base = baseDomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  if (!name || !base || name === base) return NONE;
  if (!name.endsWith(`.${base}`)) return NONE;

  const sub = name.slice(0, name.length - base.length - 1);
  const encoded = sub.split(".").at(-1);
  if (!encoded) return NONE;
  return parseEncodedLabel(encoded);
}

export function assertNever(value: never): never {
  throw new DnsGrammarError(`unexpected interaction kind: ${JSON.stringify(value)}`);
}

/** Extract just the correlation token from a query name/Host, or null if none. */
export function extractCorrelationToken(
  fqdn: string,
  baseDomain: string,
): string | null {
  const parsed = parseInteractionName(fqdn, baseDomain);
  switch (parsed.kind) {
    case "none":
      return null;
    case "capture":
    case "rebind":
    case "embed":
      return parsed.token;
    default:
      return assertNever(parsed);
  }
}
