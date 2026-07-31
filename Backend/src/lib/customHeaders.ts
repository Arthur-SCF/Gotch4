// Per-file custom response headers — an escape hatch for special cases where the
// default CORS logic gets in the way (e.g. Safari CORP blocking a cross-origin
// embed, cross-origin isolation for SharedArrayBuffer, Timing-Allow-Origin).
//
// Two entry points:
//   - validateCustomHeaders() — strict, used on API writes; rejects bad input.
//   - sanitizeCustomHeaders() — lenient, used at serve time; never throws, drops
//     anything invalid so a bad stored value can never corrupt a response.

export const MAX_CUSTOM_HEADERS = 30;
export const MAX_HEADER_NAME_LEN = 128;
export const MAX_HEADER_VALUE_LEN = 2048;

// Header names must be a valid HTTP token subset. Kept strict on purpose.
const HEADER_NAME_RE = /^[A-Za-z0-9-]+$/;

// Headers that control message framing / connection semantics. Letting a caller
// set these could corrupt or desync the response, so they are never allowed.
const DENYLISTED = new Set([
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "trailer",
  "te",
  "upgrade",
  "host",
]);

export type CustomHeaders = Record<string, string>;

export type ValidationResult =
  | { ok: true; value: CustomHeaders | null }
  | { ok: false; error: string };

/**
 * Validate untrusted custom-headers input from the API.
 * Accepts a plain object of string→string, `null`, or `undefined`.
 * Returns `value: null` when the caller wants to clear the headers
 * (null or empty object). Rejects anything malformed with a message.
 */
export function validateCustomHeaders(input: unknown): ValidationResult {
  if (input === null || input === undefined) return { ok: true, value: null };

  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "customHeaders must be an object of header name → value" };
  }

  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return { ok: true, value: null };
  if (entries.length > MAX_CUSTOM_HEADERS) {
    return { ok: false, error: `Too many custom headers (max ${MAX_CUSTOM_HEADERS})` };
  }

  const out: CustomHeaders = {};
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim();
    if (!HEADER_NAME_RE.test(name) || name.length > MAX_HEADER_NAME_LEN) {
      return { ok: false, error: `Invalid header name: "${rawName}" (allowed: letters, digits, -)` };
    }
    if (DENYLISTED.has(name.toLowerCase())) {
      return { ok: false, error: `Header "${name}" is not allowed` };
    }
    if (typeof rawValue !== "string") {
      return { ok: false, error: `Value for "${name}" must be a string` };
    }
    if (/[\r\n]/.test(rawValue)) {
      return { ok: false, error: `Value for "${name}" must not contain newlines` };
    }
    if (rawValue.length > MAX_HEADER_VALUE_LEN) {
      return { ok: false, error: `Value for "${name}" is too long (max ${MAX_HEADER_VALUE_LEN})` };
    }
    out[name] = rawValue;
  }

  return { ok: true, value: out };
}

/**
 * Serve-time coercion of a stored `customHeaders` JSON value into a clean
 * name→value map. Never throws; silently drops any entry that fails validation.
 */
export function sanitizeCustomHeaders(stored: unknown): CustomHeaders {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const out: CustomHeaders = {};
  let count = 0;
  for (const [rawName, rawValue] of Object.entries(stored as Record<string, unknown>)) {
    if (count >= MAX_CUSTOM_HEADERS) break;
    const name = rawName.trim();
    if (!HEADER_NAME_RE.test(name) || name.length > MAX_HEADER_NAME_LEN) continue;
    if (DENYLISTED.has(name.toLowerCase())) continue;
    if (typeof rawValue !== "string" || /[\r\n]/.test(rawValue) || rawValue.length > MAX_HEADER_VALUE_LEN) continue;
    out[name] = rawValue;
    count++;
  }
  return out;
}
