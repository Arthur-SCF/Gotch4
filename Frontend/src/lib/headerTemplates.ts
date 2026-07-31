export interface HeaderTemplate {
  id: string;
  name: string;
  description: string;
  headers: Record<string, string>;
}

export const HEADER_TEMPLATES: HeaderTemplate[] = [
  {
    id: "safari-corp",
    name: "Safari — allow cross-origin embed (CORP)",
    description:
      "Serve Cross-Origin-Resource-Policy: cross-origin so this file can load as a cross-origin no-cors subresource (img/script/font) when Safari or a COEP-isolated page blocks it.",
    headers: { "Cross-Origin-Resource-Policy": "cross-origin" },
  },
  {
    id: "cors-any",
    name: "CORS — allow any origin (no credentials)",
    description:
      "Access-Control-Allow-Origin: * — any origin can fetch()/XHR-read the body. Wildcard, so no cookies are sent (overrides the default per-origin reflection).",
    headers: { "Access-Control-Allow-Origin": "*" },
  },
  {
    id: "cors-expose",
    name: "CORS — expose all response headers",
    description:
      "Access-Control-Expose-Headers: * — keeps the default credentialed origin reflection and lets script read every response header.",
    headers: { "Access-Control-Expose-Headers": "*" },
  },
  {
    id: "cross-origin-isolation",
    name: "Cross-origin isolation (SharedArrayBuffer / hi-res timers)",
    description:
      "COOP: same-origin + COEP: require-corp marks the document cross-origin isolated, unlocking SharedArrayBuffer and high-resolution timers.",
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  {
    id: "timing-allow-origin",
    name: "Timing-Allow-Origin (timing side-channels)",
    description:
      "Timing-Allow-Origin: * — exposes full Resource Timing detail cross-origin, useful for XS-Leaks / timing measurements.",
    headers: { "Timing-Allow-Origin": "*" },
  },
  {
    id: "frame-anywhere",
    name: "Allow framing anywhere",
    description:
      "Content-Security-Policy: frame-ancestors * — lets this file be embedded in an iframe from any site.",
    headers: { "Content-Security-Policy": "frame-ancestors *" },
  },
];

export function serializeHeaders(map: Record<string, string> | null | undefined): string {
  if (!map) return "";
  return Object.entries(map)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}

// Parse "Name: value" lines into a header map. Splits on the first ":" only,
// skips blank lines, and drops lines with no colon or an empty name.
export function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const name = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}
