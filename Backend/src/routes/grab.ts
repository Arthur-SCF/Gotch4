import { Hono } from "hono";
import type { PrismaClient } from "../generated/prisma/client.ts";
import withPrisma, { prisma as sharedPrisma } from "../lib/prisma.ts";
import { broadcast } from "../lib/broadcast.ts";
import { sendNotification } from "../lib/notify.ts";

type ContextWithPrisma = {
  Variables: { prisma: PrismaClient };
};

export interface GrabEntry {
  id: number;
  key: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: string | null;
  ipAddress: string | null;
  capturedAt: string;
}

// In-memory store: key → entries (write-through cache over DB)
export const grabStore = new Map<string, GrabEntry[]>();

// M-05: Caps to prevent unbounded memory growth
const GRAB_STORE_MAX_PER_KEY = 500;
const GRAB_STORE_HYDRATION_LIMIT = 10_000;

// ─────────────────────────────────────────────────────────────
// Capture router — mounted at /grab
// This is the victim-facing endpoint (full CORS, any method)
// ─────────────────────────────────────────────────────────────
export const captureRouter = new Hono<ContextWithPrisma>();

captureRouter.use("/*", withPrisma);

// OPTIONS preflight
captureRouter.options("/:key{.+}", (c) => {
  const origin = c.req.header("origin");
  c.header("Access-Control-Allow-Origin", origin ?? "*");
  if (origin) c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD");
  c.header("Access-Control-Allow-Headers", "*");
  c.header("Access-Control-Max-Age", "86400");
  return c.body(null, 204);
});

// Capture any request
captureRouter.all("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const prisma = c.get("prisma");
  const method = c.req.method;

  // Collect headers
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, name) => { headers[name] = value; });

  // Collect query params
  const query: Record<string, string> = {};
  new URL(c.req.url).searchParams.forEach((value, name) => { query[name] = value; });

  // Body for mutating methods
  let body: string | null = null;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    try { body = await c.req.text(); } catch {}
  }

  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  // Persist to DB
  const grab = await prisma.grab.create({
    data: {
      key,
      method,
      headers: JSON.stringify(headers),
      query: Object.keys(query).length ? JSON.stringify(query) : null,
      body,
      ipAddress: ip,
    },
  });

  const entry: GrabEntry = {
    id: grab.id,
    key,
    method,
    headers,
    query,
    body,
    ipAddress: ip,
    capturedAt: grab.createdAt.toISOString(),
  };

  // Cache in memory — M-05: enforce per-key entry cap
  if (!grabStore.has(key)) grabStore.set(key, []);
  const keyEntries = grabStore.get(key)!;
  if (keyEntries.length < GRAB_STORE_MAX_PER_KEY) keyEntries.push(entry);

  // Push to all WebSocket clients
  broadcast({ type: "grab", key, data: entry });

  // Fire-and-forget notification — look up key's program link + pass full capture context
  void (async () => {
    try {
      const meta = await sharedPrisma.grabKeyMeta.findUnique({
        where: { key },
        include: { program: { select: { id: true, name: true } } },
      });

      // Serialize query params
      const grabQuery = Object.keys(query).length
        ? Object.entries(query).map(([k, v]) => `${k}=${v}`).join("&")
        : null;

      await sendNotification({
        type: "grab",
        programId: meta?.programId ?? null,
        programName: meta?.program?.name ?? null,
        ipAddress: ip,
        grabKey: key,
        grabMethod: method,
        grabOrigin: headers["origin"] ?? null,
        grabReferer: headers["referer"] ?? null,
        grabUserAgent: headers["user-agent"] ?? null,
        grabQuery,
        grabBody: body,
      });
    } catch (e) {
      console.error("[Grab] Notification error:", e);
    }
  })();

  // CORS on actual response
  const origin = c.req.header("origin");
  c.header("Access-Control-Allow-Origin", origin ?? "*");
  if (origin) c.header("Access-Control-Allow-Credentials", "true");

  return c.text("ok");
});

// ─────────────────────────────────────────────────────────────
// Startup hydration — reload grabStore from DB on server start
// ─────────────────────────────────────────────────────────────
export async function initGrabStore() {
  // M-05: cap hydration to prevent memory exhaustion on servers with accumulated captures
  const rows = await sharedPrisma.grab.findMany({ orderBy: { createdAt: "asc" }, take: GRAB_STORE_HYDRATION_LIMIT });
  for (const row of rows) {
    const entry: GrabEntry = {
      id: row.id,
      key: row.key,
      method: row.method,
      headers: JSON.parse(row.headers),
      query: row.query ? JSON.parse(row.query) : {},
      body: row.body,
      ipAddress: row.ipAddress,
      capturedAt: row.createdAt.toISOString(),
    };
    if (!grabStore.has(row.key)) grabStore.set(row.key, []);
    grabStore.get(row.key)!.push(entry);
  }
  if (rows.length > 0) {
    console.log(`📦 Hydrated grab store: ${grabStore.size} key(s), ${rows.length} entry(ies)`);
  }
}

// ─────────────────────────────────────────────────────────────
// API router — mounted at /api/grab
// Used by the dashboard and exploit polling scripts
// ─────────────────────────────────────────────────────────────
export const apiRouter = new Hono();

function dbRowToEntry(row: { id: number; key: string; method: string; headers: string; query: string | null; body: string | null; ipAddress: string | null; createdAt: Date }): GrabEntry {
  return {
    id: row.id,
    key: row.key,
    method: row.method,
    headers: JSON.parse(row.headers),
    query: row.query ? JSON.parse(row.query) : {},
    body: row.body,
    ipAddress: row.ipAddress,
    capturedAt: row.createdAt.toISOString(),
  };
}

// List all grab keys with their entries — reads from DB (source of truth)
apiRouter.get("/", async (c) => {
  const rows = await sharedPrisma.grab.findMany({ orderBy: { createdAt: "asc" } });
  const result: Record<string, GrabEntry[]> = {};
  for (const row of rows) {
    if (!result[row.key]) result[row.key] = [];
    result[row.key].push(dbRowToEntry(row));
  }
  // Also include keys that exist in grabStore but have no DB rows (e.g. manually added slots)
  grabStore.forEach((_, key) => { if (!result[key]) result[key] = []; });
  c.header("Access-Control-Allow-Origin", "*");
  return c.json(result);
});

// ── GrabKeyMeta endpoints ─────────────────────────────────────
// IMPORTANT: These must come BEFORE the /:key{.+} catch-all routes.

// Get all key metas (batch) — used by the frontend on page load
apiRouter.get("/metas", async (c) => {
  const metas = await sharedPrisma.grabKeyMeta.findMany({
    include: { program: { select: { id: true, name: true } } },
  });
  const result: Record<string, { programId: number | null; programName: string | null }> = {};
  for (const meta of metas) {
    result[meta.key] = {
      programId: meta.programId,
      programName: meta.program?.name ?? null,
    };
  }
  return c.json(result);
});

// Get program link for a specific key
apiRouter.get("/:key/meta", async (c) => {
  const key = c.req.param("key");
  const meta = await sharedPrisma.grabKeyMeta.findUnique({
    where: { key },
    include: { program: { select: { id: true, name: true } } },
  });
  return c.json({
    key,
    programId: meta?.programId ?? null,
    programName: meta?.program?.name ?? null,
  });
});

// Set (or clear) program link for a key — body: { programId: number | null }
apiRouter.put("/:key/meta", async (c) => {
  const key = c.req.param("key");
  const { programId } = await c.req.json();
  const meta = await sharedPrisma.grabKeyMeta.upsert({
    where: { key },
    create: { key, programId: programId ?? null },
    update: { programId: programId ?? null },
  });
  return c.json({ key, programId: meta.programId });
});

// ── Existing entry routes ─────────────────────────────────────

// Get entries for a specific key — exploit polling endpoint
// ?once=true pops from the in-memory queue (single-consumption) without touching DB
// Without ?once: reads from DB (full history)
apiRouter.get("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const once = c.req.query("once") === "true";

  if (once) {
    // Real-time queue: return in-memory entries and clear them
    const entries = grabStore.get(key) ?? [];
    if (entries.length > 0) grabStore.set(key, []);
    c.header("Access-Control-Allow-Origin", "*");
    return c.json({ key, entries, count: entries.length });
  }

  // Historical: always read from DB
  const rows = await sharedPrisma.grab.findMany({
    where: { key },
    orderBy: { createdAt: "asc" },
  });
  const entries = rows.map(dbRowToEntry);
  c.header("Access-Control-Allow-Origin", "*");
  return c.json({ key, entries, count: entries.length });
});

// Clear entries for a key (keep the key visible in UI)
apiRouter.delete("/:key{.+}/entries", async (c) => {
  const key = c.req.param("key");
  await sharedPrisma.grab.deleteMany({ where: { key } });
  grabStore.set(key, []);
  return c.json({ message: "Entries cleared" });
});

// Remove key entirely (entries + meta)
apiRouter.delete("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  await sharedPrisma.grab.deleteMany({ where: { key } });
  // Also clean up the program link for this key
  await sharedPrisma.grabKeyMeta.deleteMany({ where: { key } });
  grabStore.delete(key);
  return c.json({ message: "Key deleted" });
});
