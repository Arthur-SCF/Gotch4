#!/usr/bin/env bun
/**
 * VPS DNS Server for Remote Mode
 *
 * Standalone DNS server that runs on a VPS with public IP.
 * Captures DNS queries and forwards them to the main app via webhook.
 *
 * Usage:
 *   bun run server.js
 *
 * Configuration:
 *   Set via environment variables or .env file:
 *   - DNS_DOMAIN: Base domain to respond to (e.g., collab.example.com)
 *   - WEBHOOK_URL: Callback URL of main app (e.g., https://tunnel.example.com/api/dns/callback)
 *   - AUTH_TOKEN: Authentication token for webhook
 *   - DNS_RESPONSE_IP: IP address to return in A records (VPS public IP)
 *   - DNS_TTL: TTL for DNS responses (default: 0)
 *   - DNS_PORT: Port to listen on (default: 53)
 */

import dns2 from 'dns2';
import { readFileSync, existsSync } from 'fs';

const { Packet } = dns2;

// ── HTTP forwarder ────────────────────────────────────────────────────────────
// Listens on HTTP_PORT (default 80) and proxies every request to APP_URL.
// Preserves the original Host header so the app's subdomain detection fires.
// Optional — disabled if APP_URL is not set.
async function startHttpForwarder(config) {
  if (!config.appUrl) {
    console.log('[HTTP] APP_URL not set — HTTP subdomain forwarding disabled');
    return;
  }

  const appUrl = config.appUrl.replace(/\/$/, '');
  const httpPort = config.httpPort;

  const handleRequest = async (req) => {
    const url = new URL(req.url);
    const target = `${appUrl}${url.pathname}${url.search}`;

    // Build forwarded headers — keep original Host so subdomain detection works
    const headers = new Headers(req.headers);
    headers.set('x-forwarded-host', headers.get('host') || '');
    headers.set('x-forwarded-for', headers.get('x-forwarded-for') || req.socket?.remoteAddress || '');
    headers.set('x-forwarded-proto', 'http');
    // Remove hop-by-hop headers
    headers.delete('connection');
    headers.delete('keep-alive');

    try {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      });
    } catch (err) {
      console.error(`[HTTP] Forward error: ${err.message}`);
      return new Response('Bad Gateway', { status: 502 });
    }
  };

  Bun.serve({
    port: httpPort,
    hostname: '0.0.0.0',
    fetch: handleRequest,
  });

  console.log(`✅ [HTTP] Forwarder started on port ${httpPort} → ${appUrl}`);
}

// Load configuration from environment or .env file
function loadConfig() {
  // Try to load .env file if it exists
  if (existsSync('.env')) {
    const envContent = readFileSync('.env', 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }

  return {
    domain: process.env.DNS_DOMAIN,
    webhookUrl: process.env.WEBHOOK_URL,
    authToken: process.env.AUTH_TOKEN,
    responseIp: process.env.DNS_RESPONSE_IP,
    ttl: parseInt(process.env.DNS_TTL || '0'),
    port: parseInt(process.env.DNS_PORT || '53'),
    appUrl: process.env.APP_URL || null,
    httpPort: parseInt(process.env.HTTP_PORT || '80'),
  };
}

// Validate configuration
function validateConfig(config) {
  const errors = [];

  if (!config.domain) {
    errors.push('DNS_DOMAIN is required (e.g., collab.example.com)');
  }

  if (!config.webhookUrl) {
    errors.push('WEBHOOK_URL is required (e.g., https://tunnel.example.com/api/dns/callback)');
  } else if (!config.webhookUrl.startsWith('https://')) {
    errors.push('WEBHOOK_URL must use HTTPS for security');
  }

  if (!config.authToken) {
    errors.push('AUTH_TOKEN is required (must match your main app settings)');
  } else if (config.authToken.length < 32) {
    errors.push('AUTH_TOKEN must be at least 32 characters for security');
  }

  if (!config.responseIp) {
    errors.push('DNS_RESPONSE_IP is required (your VPS public IP address)');
  }

  if (errors.length > 0) {
    console.error('\n❌ Configuration Error:\n');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease create a .env file or set environment variables.\n');
    console.error('Example .env file:');
    console.error('  DNS_DOMAIN=collab.example.com');
    console.error('  WEBHOOK_URL=https://tunnel.example.com/api/dns/callback');
    console.error('  AUTH_TOKEN=your-32-character-or-longer-token-here');
    console.error('  DNS_RESPONSE_IP=203.0.113.42');
    console.error('  DNS_TTL=0');
    console.error('');
    process.exit(1);
  }
}

// Send DNS query to webhook
async function sendToWebhook(config, queryData) {
  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.authToken}`,
      },
      body: JSON.stringify(queryData),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Webhook] Failed (${response.status}): ${error}`);
      return false;
    }

    const result = await response.json();
    return result.success;

  } catch (error) {
    console.error('[Webhook] Error:', error.message);
    return false;
  }
}

// Convert DNS query type number to name
function getQueryTypeName(type) {
  const types = {
    1: 'A',
    2: 'NS',
    5: 'CNAME',
    6: 'SOA',
    15: 'MX',
    16: 'TXT',
    28: 'AAAA',
    33: 'SRV',
    255: 'ANY',
  };
  return types[type] || `TYPE${type}`;
}

// Main function
async function main() {
  const config = loadConfig();
  validateConfig(config);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🌐 VPS DNS Server - Remote Mode');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Domain:      *.${config.domain}`);
  console.log(`  Response IP: ${config.responseIp}`);
  console.log(`  TTL:         ${config.ttl} seconds`);
  console.log(`  DNS Port:    ${config.port}`);
  console.log(`  HTTP Port:   ${config.httpPort}${config.appUrl ? '' : ' (disabled — APP_URL not set)'}`);
  console.log(`  App URL:     ${config.appUrl || '(not set)'}`);
  console.log(`  Webhook:     ${config.webhookUrl}`);
  console.log('\n═══════════════════════════════════════════════════════\n');

  // Create DNS server
  const server = dns2.createServer({
    udp: true,
    tcp: true,
    handle: async (request, send) => {
      const query = request.questions[0];
      const response = Packet.createResponseFromRequest(request);

      // Only process queries for our domain
      if (!query.name.endsWith(config.domain)) {
        response.header.rcode = 3; // NXDOMAIN
        send(response);
        return;
      }

      // Extract client IP
      const ipAddress = request.address?.address || request.address || 'unknown';

      // Log query to console
      console.log(`[DNS] ${query.name} (${getQueryTypeName(query.type)}) from ${ipAddress}`);

      // Send to webhook (async, don't wait)
      sendToWebhook(config, {
        query: query.name,
        type: getQueryTypeName(query.type),
        ipAddress: ipAddress,
        timestamp: new Date().toISOString(),
        protocol: request.address ? 'udp' : 'tcp',
      }).catch(err => {
        console.error('[Webhook] Failed:', err.message);
      });

      // Respond to DNS query
      if (query.type === Packet.TYPE.A) {
        response.answers.push({
          name: query.name,
          type: Packet.TYPE.A,
          class: Packet.CLASS.IN,
          ttl: config.ttl,
          address: config.responseIp,
        });
      } else if (query.type === Packet.TYPE.AAAA) {
        // IPv6 - respond with ::1 or configured IPv6
        response.answers.push({
          name: query.name,
          type: Packet.TYPE.AAAA,
          class: Packet.CLASS.IN,
          ttl: config.ttl,
          address: '::1',
        });
      } else if (query.type === Packet.TYPE.TXT) {
        response.answers.push({
          name: query.name,
          type: Packet.TYPE.TXT,
          class: Packet.CLASS.IN,
          ttl: config.ttl,
          data: ['VPS DNS Capture Server'],
        });
      }

      send(response);
    },
  });

  // Start server
  try {
    await server.listen({
      udp: { port: config.port, address: '0.0.0.0' },
      tcp: { port: config.port, address: '0.0.0.0' }
    });

    console.log(`✅ DNS server started on port ${config.port}`);
    console.log('   Listening for queries...\n');

  } catch (error) {
    console.error('\n❌ Failed to start DNS server:', error.message);

    if (error.code === 'EACCES') {
      console.error('\n💡 Port 53 requires elevated privileges:');
      console.error('   sudo setcap \'cap_net_bind_service=+ep\' $(which bun)');
      console.error('   Then run: bun run server.js');
    } else if (error.code === 'EADDRINUSE') {
      console.error('\n💡 Port 53 is already in use:');
      console.error('   sudo systemctl stop systemd-resolved');
      console.error('   Or use a different port: DNS_PORT=5353 bun run server.js');
    }

    console.error('');
    process.exit(1);
  }

  // Start HTTP forwarder for subdomain detection (optional — failure does not stop DNS)
  await startHttpForwarder(config).catch(err => {
    console.error(`[HTTP] Forwarder failed to start: ${err.message}`);
    console.error('[HTTP] DNS server continues running without HTTP forwarding.');
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    await server.close();
    process.exit(0);
  });
}

// Run server
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
