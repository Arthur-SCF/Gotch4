import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { PrismaClient } from "../generated/prisma/client.ts";
import withPrisma from "../lib/prisma.ts";
import { getProgramsWithScope } from "../lib/programScopeCache.ts";
import { matchScope } from "../lib/scopeMatcher.ts";
import { sendNotification } from "../lib/notify.ts";
import { broadcast } from "../lib/broadcast.ts";

type ContextWithPrisma = {
  Variables: {
    prisma: PrismaClient;
  };
};

const app = new Hono<ContextWithPrisma>();

// Permissive CORS middleware for all webhook routes.
// Reflects the Origin header so fetch() with credentials: 'include' works from any origin.
// Must run before the rate limiter so even 429 responses carry the CORS headers.
app.use("/*", async (c, next) => {
  const origin = c.req.header("origin");
  c.header("Access-Control-Allow-Origin", origin ?? "*");
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD");
  c.header("Access-Control-Allow-Headers", "*");
  c.header("Access-Control-Max-Age", "86400");
  await next();
});

// Apply rate limiting to prevent abuse
// Limit: 100 requests per minute per IP
const limiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  standardHeaders: "draft-6",
  keyGenerator: (c) => {
    // Use IP address from headers or fallback
    const xForwardedFor = c.req.header("x-forwarded-for");
    const xRealIp = c.req.header("x-real-ip");
    const cfConnectingIp = c.req.header("cf-connecting-ip");
    return xForwardedFor?.split(",")[0].trim() || xRealIp || cfConnectingIp || "unknown";
  },
});

// Apply rate limiter and prisma middleware to all routes
app.use("/*", limiter, withPrisma);

// Webhook endpoint - capture all HTTP requests on any sub-path (e.g. /webhook/exfil)
app.all("/*", async (c) => {
  try {
    const prisma = c.get("prisma");
    const req = c.req;

    // Extract request details
    const method = req.method;
    const path = req.path;
    const query = req.url.split("?")[1] || null;

    // Construct full URL with query parameters
    const fullUrl = query ? `${path}?${query}` : path;

    const headers = JSON.stringify(
      Object.fromEntries(req.raw.headers.entries())
    );

    // Get body for POST/PUT/PATCH requests
    let body = null;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      try {
        body = await req.text();
      } catch (e) {
        body = null;
      }
    }

    // Extract IP address - check multiple sources including IPv6
    let ipAddress = null;
    const xForwardedFor = req.header("x-forwarded-for");
    const xRealIp = req.header("x-real-ip");
    const cfConnectingIp = req.header("cf-connecting-ip"); // Cloudflare

    if (xForwardedFor) {
      // x-forwarded-for can contain multiple IPs, take the first one
      ipAddress = xForwardedFor.split(",")[0].trim();
    } else if (xRealIp) {
      ipAddress = xRealIp;
    } else if (cfConnectingIp) {
      ipAddress = cfConnectingIp;
    } else {
      ipAddress = "unknown";
    }

    const userAgent = req.header("user-agent") || null;
    const referer = req.header("referer") || null;
    const host = req.header("host") || null;
    const protocol = req.url.startsWith("https") ? "https" : "http";
    const contentType = req.header("content-type") || null;
    const contentLengthHeader = req.header("content-length");
    const contentLength = contentLengthHeader
      ? parseInt(contentLengthHeader)
      : null;

    // Extract cookies
    const cookieHeader = req.header("cookie");
    const cookies = cookieHeader || null;

    // ── Scope matching ──────────────────────────────────────────────────────
    // Match incoming host against all program scopes to auto-assign programId.
    let programId: number | null = null;
    let programName: string | null = null;

    if (host) {
      try {
        const programs = await getProgramsWithScope();
        for (const p of programs) {
          if (matchScope(p.scope, host)) {
            programId = p.id;
            programName = p.name;
            break;
          }
        }
      } catch (e) {
        console.error("[Webhook] Scope matching error:", e);
      }
    }

    // Save event to database (programId set if scope matched)
    const event = await prisma.event.create({
      data: {
        method,
        path,
        fullUrl,
        query,
        headers,
        body,
        ipAddress,
        userAgent,
        referer,
        host,
        protocol,
        contentType,
        contentLength,
        cookies,
        programId,
      },
    });

    // Broadcast immediately so the Events badge updates in real-time
    broadcast({ type: "new_event", event: { id: event.id, type: "http" } });

    // Fire-and-forget notification — pass everything we captured
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
      contentLength,
      cookies,
      body,
    });

    // OPTIONS preflight: event captured, return 204 No Content
    if (method === "OPTIONS") {
      return c.body(null, 204);
    }

    return c.json({
      message: "Request captured successfully",
      eventId: event.id,
      timestamp: event.createdAt,
    });
  } catch (error) {
    console.error("Error capturing request:", error);
    return c.json({ error: "Failed to capture request" }, 500);
  }
});

export default app;
