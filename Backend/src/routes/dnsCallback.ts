import { Hono } from 'hono';
import { timingSafeEqual } from 'crypto';
import type { PrismaClient } from '../generated/prisma/client.ts';
import withPrisma from '../lib/prisma.js';
import { getProgramsWithScope } from '../lib/programScopeCache.ts';
import { matchScope } from '../lib/scopeMatcher.ts';
import { sendNotification } from '../lib/notify.ts';
import { broadcast } from '../lib/broadcast.ts';

const app = new Hono<{ Variables: { prisma: PrismaClient } }>();
app.use('/*', withPrisma);

// In-memory last successful callback time — resets on restart.
// Used by the status endpoint to distinguish "configured" from "actually working".
let lastCallbackAt: Date | null = null;
export function getLastCallbackAt() { return lastCallbackAt; }

/**
 * DNS Callback webhook for Remote Mode
 * Receives DNS queries from VPS DNS server
 * Validates auth token and logs to database
 */

interface DnsCallbackPayload {
  query: string;        // DNS query name (e.g., "test.example.com")
  type: string;         // Query type (A, AAAA, TXT, etc.)
  ipAddress: string;    // Client IP that made the query
  timestamp: string;    // ISO 8601 timestamp
  protocol?: string;    // "udp" or "tcp"
}

// POST /api/dns/callback
// Receives DNS query from VPS and logs to database
app.post('/callback', async (c) => {
  try {
    // Get auth token from header
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      return c.json({
        error: 'Missing Authorization header',
        message: 'VPS must provide authentication token',
      }, 401);
    }

    // Extract token (format: "Bearer <token>" or just "<token>")
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    // Get settings to validate token
    const settings = await c.var.prisma.settings.findFirst();

    if (!settings) {
      return c.json({
        error: 'Settings not configured',
        message: 'Configure DNS settings before receiving callbacks',
      }, 500);
    }

    // Validate auth token (constant-time comparison to prevent timing attacks)
    if (!settings.dnsAuthToken) {
      return c.json({
        error: 'Auth token not configured',
        message: 'Configure authentication token in settings',
      }, 500);
    }

    // Constant-time comparison to prevent timing attacks
    const expectedToken = Buffer.from(settings.dnsAuthToken, 'utf8');
    const providedToken = Buffer.from(token, 'utf8');

    const tokensMatch = expectedToken.length === providedToken.length &&
      timingSafeEqual(expectedToken, providedToken);

    if (!tokensMatch) {
      return c.json({ error: 'Invalid authentication token' }, 403);
    }

    // Parse request body
    const payload: DnsCallbackPayload = await c.req.json();

    // Validate required fields
    if (!payload.query || !payload.type || !payload.ipAddress) {
      return c.json({
        error: 'Invalid payload',
        message: 'Required fields: query, type, ipAddress',
      }, 400);
    }

    // Validate query domain matches configured base domain
    if (settings.dnsBaseDomain && !payload.query.endsWith(settings.dnsBaseDomain)) {
      console.log(`[DNS Callback] Rejected query for ${payload.query} (expected *.${settings.dnsBaseDomain})`);
      return c.json({
        error: 'Invalid domain',
        message: `Query must be for *.${settings.dnsBaseDomain}`,
      }, 400);
    }

    // Scope matching: auto-assign to a program if query domain matches
    let programId: number | null = null;
    let programName: string | null = null;
    try {
      const programs = await getProgramsWithScope();
      for (const p of programs) {
        if (matchScope(p.scope, payload.query)) {
          programId = p.id;
          programName = p.name;
          break;
        }
      }
    } catch (e) {
      console.error('[DNS Callback] Scope matching error:', e);
    }

    // Log query to database
    const event = await c.var.prisma.event.create({
      data: {
        type: 'dns',
        dnsQuery: payload.query,
        dnsType: payload.type.toUpperCase(),
        ipAddress: payload.ipAddress,
        headers: JSON.stringify({
          protocol: payload.protocol || 'udp',
          timestamp: payload.timestamp,
          source: 'vps-callback',
        }),
        programId,
      },
    });

    // Mark last successful callback for status endpoint
    lastCallbackAt = new Date();

    // Broadcast immediately to all connected WebSocket clients
    broadcast({ type: "new_event", event: { id: event.id, type: "dns" } });

    // Fire-and-forget notification
    void sendNotification({
      type: 'dns',
      programId,
      programName,
      dnsQuery: payload.query,
      dnsType: payload.type.toUpperCase(),
      ipAddress: payload.ipAddress,
    });

    console.log(`[DNS Callback] Query: ${payload.query} (${payload.type}) from ${payload.ipAddress}`);

    // Return success response
    return c.json({
      success: true,
      eventId: event.id,
      message: 'DNS query logged successfully',
    });

  } catch (error: any) {
    console.error('[DNS Callback] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /api/dns/callback/health
// Health check endpoint for VPS to verify connectivity
app.get('/callback/health', async (c) => {
  const settings = await c.var.prisma.settings.findFirst();

  return c.json({
    status: 'ok',
    configured: !!settings?.dnsAuthToken,
    mode: settings?.dnsMode || 'unknown',
    timestamp: new Date().toISOString(),
  });
});

export default app;
