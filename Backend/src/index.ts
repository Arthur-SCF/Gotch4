import { Hono } from "hono";
import { serveStatic } from "hono/bun";

import type { PrismaClient } from "./generated/prisma/client.ts";
import withPrisma from "./lib/prisma.js";
import { ensureBucketExists, minioClient, MINIO_BUCKET } from "./lib/minio.ts";

type ContextWithPrisma = {
  Variables: {
    prisma: PrismaClient;
    jwtPayload: Record<string, unknown>;
  };
};

const app = new Hono<ContextWithPrisma>();

import { cors } from "hono/cors";
import { jwtVerify } from "jose";
import { JWKS, KEYCLOAK_ISSUER } from "./lib/jwks.ts";

// Configure CORS with environment-based allowed origins
// In development: allow localhost, in production: specify allowed domains
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:5173", "http://localhost:3000"];

// Apply CORS only to API routes, not webhook (so webhook can capture ALL requests including OPTIONS)
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin (e.g., mobile apps, curl)
      if (!origin) return null;
      // Check if origin is in allowed list
      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
  })
);

// ── Subdomain HTTP detection ───────────────────────────────────────────────────
// If DNS detection is enabled and the Host header is a subdomain of dnsBaseDomain,
// log the request as an HTTP event (fire-and-forget, doesn't alter the response).
// This catches any HTTP-level OOB hit, not just DNS lookups.
app.use("/*", async (c, next) => {
  const { enabled, baseDomain } = getDnsState();
  if (enabled && baseDomain) {
    const host = (c.req.header("host") || "").toLowerCase().split(":")[0];
    // Match *.baseDomain (subdomains only, not the domain itself)
    if (host.endsWith("." + baseDomain) && host !== baseDomain) {
      void (async () => {
        try {
          const req = c.req;
          const method = req.method;
          const path = req.path;
          const query = req.url.split("?")[1] || null;
          const fullUrl = query ? `${path}?${query}` : path;
          const userAgent = req.header("user-agent") || null;
          const referer = req.header("referer") || null;
          const protocol = req.url.startsWith("https") ? "https" : "http";
          const contentType = req.header("content-type") || null;
          const ipAddress =
            req.header("x-forwarded-for")?.split(",")[0].trim() ||
            req.header("x-real-ip") ||
            req.header("cf-connecting-ip") ||
            "unknown";

          let programId: number | null = null;
          let programName: string | null = null;
          try {
            const programs = await getProgramsWithScope();
            for (const p of programs) {
              if (matchScope(p.scope, host)) {
                programId = p.id;
                programName = p.name;
                break;
              }
            }
          } catch {}

          const event = await sharedPrisma.event.create({
            data: {
              type: "http",
              method,
              path,
              fullUrl,
              query,
              host,
              protocol,
              userAgent,
              referer,
              contentType,
              ipAddress,
              headers: JSON.stringify(Object.fromEntries(req.raw.headers.entries())),
              programId,
              notes: "subdomain-detect",
            },
          });

          broadcast({ type: "new_event", event: { id: event.id, type: "http" } });

          void sendNotification({
            type: "http",
            programId,
            programName,
            ipAddress,
            method,
            fullUrl,
            host,
            protocol,
            userAgent,
            referer,
            contentType,
          });
        } catch (e) {
          console.error("[SubdomainDetect] Error logging event:", e);
        }
      })();
    }
  }
  return next();
});

import { requireAuth } from "./middleware/auth.ts";
// Exempt DNS callback — it has its own Bearer token auth (not Keycloak JWT)
app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/dns/callback") || c.req.path === "/api/dns/callback/health") return next();
  return requireAuth(c, next);
});

// Initialize MinIO bucket on startup
await ensureBucketExists().catch(console.error);

// ------------------
// Routes
// ------------------

import events from "./routes/events.ts";
import files from "./routes/files.ts";
import programs from "./routes/programs.ts";
import webhook from "./routes/webhook.ts";
import payloads from "./routes/payloads.ts";
import payloadCategories from "./routes/payloadCategories.ts";
import config from "./routes/config.ts";
import templates from "./routes/templates.ts";
import { captureRouter, apiRouter as grabApiRouter } from "./routes/grab.ts";
import { ezCaptureRouter, ezApiRouter } from "./routes/ez.ts";
import settings from "./routes/settings.ts";
import dnsCallback from "./routes/dnsCallback.ts";
import { getWebhookPath } from "./lib/webhookState.ts";
import { getDnsState } from "./lib/dnsState.ts";
import { prisma as sharedPrisma } from "./lib/prisma.ts";
import { broadcast } from "./lib/broadcast.ts";
import { sendNotification } from "./lib/notify.ts";
import { getProgramsWithScope } from "./lib/programScopeCache.ts";
import { matchScope } from "./lib/scopeMatcher.ts";

const routes = app
  .route("/api/events", events)
  .route("/api/files", files)
  .route("/api/grab", grabApiRouter)
  .route("/api/programs", programs)
  .route("/api/payloads", payloads)
  .route("/api/payload-categories", payloadCategories)
  .route("/api/config", config)
  .route("/api/templates", templates)
  .route("/grab", captureRouter)
  .route("/ez", ezCaptureRouter)
  .route("/api/ez", ezApiRouter)
  .route("/api/dns", dnsCallback)
  .route("/", settings);

export type AppType = typeof routes;

// Dynamic webhook path — read from in-memory state (set at startup, updated via settings).
// Delegates to the webhook Hono app which has its own CORS + rate-limiter middleware.
app.all('/*', async (c, next) => {
  const prefix = '/' + getWebhookPath();
  const reqPath = c.req.path;
  if (reqPath === prefix || reqPath.startsWith(prefix + '/')) {
    return webhook.fetch(c.req.raw);
  }
  return next();
});

// Serve frontend static files from public/
app.use('/*', serveStatic({ root: './public' }));

// CRITICAL: Catch-all file serving route MUST be LAST
// Serves files at custom URL paths from database

// OPTIONS preflight handler for file paths (required for cross-origin fetches with custom headers)
app.options("/*", (c) => {
  const origin = c.req.header("origin");
  c.header("Access-Control-Allow-Origin", origin ?? "*");
  if (origin) c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  c.header("Access-Control-Allow-Headers", "*");
  c.header("Access-Control-Max-Age", "86400");
  return c.body(null, 204);
});

app.get("/*", withPrisma, async (c, next) => {
  try {
    const prisma = c.get("prisma");
    const requestPath = c.req.path;

    // Skip API routes
    if (requestPath.startsWith("/api/")) {
      return c.text("Not found", 404);
    }

    const file = await prisma.file.findUnique({ where: { urlPath: requestPath } });

    if (!file) {
      return next();
    }

    // Detection: log ALL access attempts (including unauthenticated) when detectHit is enabled.
    // Intentionally placed BEFORE the auth check — the point is to capture any OOB hit,
    // even one that will ultimately be rejected for missing credentials.
    if (file.detectHit) {
      void (async () => {
        try {
          const req = c.req;
          const method = req.method;
          const query = req.url.split("?")[1] || null;
          const fullUrl = query ? `${requestPath}?${query}` : requestPath;
          const userAgent = req.header("user-agent") || null;
          const referer = req.header("referer") || null;
          const host = req.header("host") || null;
          const protocol = req.url.startsWith("https") ? "https" : "http";
          const ipAddress =
            req.header("x-forwarded-for")?.split(",")[0].trim() ||
            req.header("x-real-ip") ||
            req.header("cf-connecting-ip") ||
            "unknown";

          const contentType = req.header("content-type") || null;

          let programName: string | null = null;
          if (file.programId) {
            try {
              const prog = await sharedPrisma.program.findUnique({ where: { id: file.programId }, select: { name: true } });
              programName = prog?.name ?? null;
            } catch {}
          }

          const event = await sharedPrisma.event.create({
            data: {
              type: "http",
              method,
              path: requestPath,
              fullUrl,
              query,
              host,
              protocol,
              userAgent,
              referer,
              contentType,
              ipAddress,
              headers: JSON.stringify(Object.fromEntries(req.raw.headers.entries())),
              programId: file.programId,
              notes: `file-detect:${file.filename}`,
            },
          });

          broadcast({ type: "new_event", event: { id: event.id, type: "http" } });

          void sendNotification({
            type: "http",
            programId: file.programId,
            programName,
            ipAddress,
            method,
            fullUrl,
            host,
            protocol,
            userAgent,
            referer,
            contentType,
            detectedFilename: file.filename,
          });
        } catch (e) {
          console.error("[FileDetect] Error logging hit:", e);
        }
      })();
    }

    // Private files require a valid Bearer token
    if (!file.isPublic) {
      const authHeader = c.req.header("Authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) return new Response("Unauthorized", { status: 401 });
      try {
        await jwtVerify(token, JWKS, {
          issuer: KEYCLOAK_ISSUER,
          clockTolerance: 30,
          algorithms: ["RS256"],
        });
      } catch {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Get object from MinIO
    const stream = await minioClient.getObject(MINIO_BUCKET, file.path);

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);

    const origin = c.req.header("origin");
    if (file.isPublic) {
      // Public files: wildcard CORS for cross-origin exploit delivery
      c.header("Access-Control-Allow-Origin", origin ?? "*");
      if (origin) c.header("Access-Control-Allow-Credentials", "true");
    } else {
      // Private files: CORS only for known dashboard origins
      if (origin && allowedOrigins.includes(origin)) {
        c.header("Access-Control-Allow-Origin", origin);
        c.header("Access-Control-Allow-Credentials", "true");
      }
    }

    c.header("Content-Type", file.mimetype);
    return c.body(content);
  } catch (error) {
    console.error("Error serving file:", error);
    return c.text("Failed to serve file", 500);
  }
});

// SPA fallback — serve index.html for client-side routes
app.get('/*', serveStatic({ path: 'index.html', root: './public' }));

export default app;
