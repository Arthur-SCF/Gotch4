import "dotenv/config";
import app from "./index.ts";
import { prisma } from "./lib/prisma.ts";
import { registerBroadcast } from "./lib/broadcast.ts";
import { initGrabStore } from "./routes/grab.ts";
import { jwtVerify } from "jose";
import { JWKS, KEYCLOAK_ISSUER } from "./lib/jwks.ts";

// WebSocket client management
const clients = new Set<any>();
// Initialize to current max so we never flood clients with historical events on restart
const _latestEvent = await prisma.event.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
let lastEventId = _latestEvent?.id ?? 0;
let pollInterval: NodeJS.Timeout | null = null;

// Broadcast new events to all connected WebSocket clients
async function broadcastNewEvents() {
  try {
    const newEvents = await prisma.event.findMany({
      where: {
        id: {
          gt: lastEventId,
        },
      },
      orderBy: {
        id: "asc",
      },
      take: 100,
    });

    if (newEvents.length > 0) {
      lastEventId = newEvents[newEvents.length - 1].id;

      const message = JSON.stringify({
        type: "new_events",
        events: newEvents,
        count: newEvents.length,
      });

      // Broadcast to all connected clients
      let disconnected = 0;
      clients.forEach((ws) => {
        try {
          ws.send(message);
        } catch (error) {
          console.error("Error sending to client:", error);
          clients.delete(ws);
          disconnected++;
        }
      });

      if (disconnected > 0) {
        console.log(`Cleaned up ${disconnected} disconnected clients`);
      }

      console.log(`📡 Broadcast ${newEvents.length} new events to ${clients.size} clients`);
    }
  } catch (error) {
    console.error("Error broadcasting new events:", error);
  }
}

function startPolling() {
  if (!pollInterval && clients.size > 0) {
    console.log("▶️  Starting event polling (5s interval)");
    pollInterval = setInterval(broadcastNewEvents, 5000);
  }
}

function stopPolling() {
  if (pollInterval && clients.size === 0) {
    console.log("⏸️  Stopping event polling (no clients)");
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

const port = parseInt(process.env.PORT || "3000");

// Bun server with native WebSocket support
const server = Bun.serve({
  port,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade for /api/ws/events
    if (url.pathname === "/api/ws/events") {
      const token = url.searchParams.get("token");
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
      const success = server.upgrade(req);
      if (success) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 426 });
    }

    // All other requests go to Hono app
    return app.fetch(req);
  },

  websocket: {
    open(ws) {
      console.log("✅ New WebSocket client connected");
      clients.add(ws);
      // Register broadcast fn on first client connect (idempotent)
      registerBroadcast((msg) => {
        clients.forEach((client) => {
          try { client.send(msg); } catch { clients.delete(client); }
        });
      });

      // Send connection confirmation
      ws.send(
        JSON.stringify({
          type: "connected",
          message: "Connected to event stream",
          clients: clients.size,
          timestamp: new Date().toISOString(),
        })
      );

      // Start polling when first client connects
      if (clients.size === 1) {
        startPolling();
      }
    },

    message(ws, message) {
      try {
        const data =
          typeof message === "string"
            ? JSON.parse(message)
            : JSON.parse(Buffer.from(message).toString());

        // Handle ping/pong to keep connection alive
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
        }
      } catch (error) {
        console.error("Invalid message received:", error);
      }
    },

    close(ws, code, reason) {
      console.log(`❌ WebSocket client disconnected (code: ${code})`);
      clients.delete(ws);

      // Stop polling when last client disconnects
      if (clients.size === 0) {
        stopPolling();
      }
    },

    error(ws, error) {
      console.error("WebSocket error:", error);
      clients.delete(ws);
    },

    // Optional: handle drain event for backpressure
    drain(ws) {
      console.log("WebSocket drain event");
    },
  },
});

// Hydrate in-memory grab store from DB
await initGrabStore();

// Initialize in-memory webhook path from DB
import { setWebhookPath } from './lib/webhookState.ts';
import { setDnsState } from './lib/dnsState.ts';
const initSettings = await prisma.settings.findFirst({ select: { webhookPath: true, dnsEnabled: true, dnsBaseDomain: true } });
if (initSettings?.webhookPath) setWebhookPath(initSettings.webhookPath);
setDnsState(initSettings?.dnsEnabled ?? false, initSettings?.dnsBaseDomain ?? null);

console.log("");
console.log("═══════════════════════════════════════════════════════");
console.log("  🚀 Gotch4");
console.log("═══════════════════════════════════════════════════════");
console.log("");
console.log(`  HTTP API:   http://localhost:${port}`);
console.log(`  WebSocket:  ws://localhost:${port}/api/ws/events`);
console.log("");
console.log("═══════════════════════════════════════════════════════");
console.log("");

// Auto-start DNS server if enabled
import { dnsController } from './lib/dnsController.ts';

dnsController.start().then((started) => {
  if (!started) {
    console.log('⚠️  [DNS] Server not started (disabled or not configured)');
    console.log('   Configure DNS in Settings (/settings) to enable');
  }
}).catch((error) => {
  console.error('❌ [DNS] Failed to auto-start:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await dnsController.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await dnsController.stop();
  process.exit(0);
});
