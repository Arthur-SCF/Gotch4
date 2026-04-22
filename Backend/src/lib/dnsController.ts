// @ts-ignore -- no type declarations for dns2
import dns2 from 'dns2';
import { prisma } from './prisma.ts';
import { getProgramsWithScope } from './programScopeCache.ts';
import { matchScope } from './scopeMatcher.ts';
import { sendNotification } from './notify.ts';
import { broadcast } from './broadcast.ts';

const { Packet } = dns2;

class DnsController {
  private server: any = null;
  private isRunning = false;

  /**
   * Start DNS server on port 53 (Local Mode only)
   * Reads configuration from database
   * Returns true if started successfully
   */
  async start(): Promise<boolean> {
    const settings = await prisma.settings.findFirst();

    // Check if DNS is enabled
    if (!settings?.dnsEnabled) {
      console.log('[DNS] Disabled in settings');
      return false;
    }

    // Only start local DNS server in local mode
    if (settings.dnsMode !== 'local') {
      console.log('[DNS] Remote mode enabled - local DNS server not started');
      console.log('[DNS] Configure VPS DNS server separately');
      return false;
    }

    // Check if base domain is configured
    if (!settings.dnsBaseDomain) {
      console.log('[DNS] Base domain not configured');
      return false;
    }

    // Check if already running
    if (this.isRunning) {
      console.log('[DNS] Already running');
      return true;
    }

    try {
      this.server = dns2.createServer({
        udp: true,
        tcp: true,
        handle: async (request: any, send: any) => {
          const query = request.questions[0];
          const response = Packet.createResponseFromRequest(request);

          // Only process queries for our domain
          if (!query.name.endsWith(settings.dnsBaseDomain!)) {
            response.header.rcode = 3; // NXDOMAIN - domain doesn't exist
            send(response);
            return;
          }

          // Log query to database
          try {
            // Extract IP address - dns2 library structure varies between UDP/TCP
            const ipAddress = request.address?.address || request.address || 'unknown';
            const dnsType = this.getQueryTypeName(query.type);

            // Scope matching: auto-assign to a program if the queried domain matches
            let programId: number | null = null;
            let programName: string | null = null;
            try {
              const programs = await getProgramsWithScope();
              for (const p of programs) {
                if (matchScope(p.scope, query.name)) {
                  programId = p.id;
                  programName = p.name;
                  break;
                }
              }
            } catch (e) {
              console.error('[DNS] Scope matching error:', e);
            }

            const dnsEvent = await prisma.event.create({
              data: {
                type: 'dns',
                dnsQuery: query.name,
                dnsType,
                ipAddress: ipAddress,
                headers: JSON.stringify({
                  protocol: request.address ? 'udp' : 'tcp',
                  rawAddress: request.address
                }),
                programId,
              },
            });

            // Broadcast immediately so Events badge updates in real-time
            broadcast({ type: "new_event", event: { id: dnsEvent.id, type: "dns" } });

            // Fire-and-forget notification
            void sendNotification({
              type: 'dns',
              programId,
              programName,
              dnsQuery: query.name,
              dnsType,
              ipAddress,
            });

            console.log(`[DNS] Query: ${query.name} (${dnsType}) from ${ipAddress}`);
          } catch (error) {
            console.error('[DNS] Failed to log query to database:', error);
          }

          // Respond based on query type
          if (query.type === Packet.TYPE.A) {
            response.answers.push({
              name: query.name,
              type: Packet.TYPE.A,
              class: Packet.CLASS.IN,
              ttl: settings.dnsTtl,
              address: settings.dnsResponseIp || '127.0.0.1',
            });
          } else if (query.type === Packet.TYPE.AAAA) {
            // IPv6 support (optional)
            response.answers.push({
              name: query.name,
              type: Packet.TYPE.AAAA,
              class: Packet.CLASS.IN,
              ttl: settings.dnsTtl,
              address: '::1', // or configured IPv6
            });
          } else if (query.type === Packet.TYPE.TXT) {
            // TXT record support
            response.answers.push({
              name: query.name,
              type: Packet.TYPE.TXT,
              class: Packet.CLASS.IN,
              ttl: settings.dnsTtl,
              data: ['DNS capture server'], // Can be configured
            });
          }

          send(response);
        },
      });

      // Bind to IPv4 only (0.0.0.0) to avoid IPv6 issues on some systems
      await this.server.listen({
        udp: { port: 53, address: '0.0.0.0' },
        tcp: { port: 53, address: '0.0.0.0' }
      });
      this.isRunning = true;
      console.log(`✅ [DNS] Server started on port 53 for ${settings.dnsBaseDomain}`);
      console.log(`[DNS] Response IP: ${settings.dnsResponseIp || '127.0.0.1'}`);
      return true;

    } catch (error: any) {
      console.error('❌ [DNS] Failed to start:', error);

      // Check for permission errors
      if (error.code === 'EACCES') {
        console.error('[DNS] Port 53 requires elevated privileges.');
        console.error('[DNS] Run: sudo setcap \'cap_net_bind_service=+ep\' $(which bun)');
      }

      // Check for port already in use
      if (error.code === 'EADDRINUSE') {
        console.error('[DNS] Port 53 already in use. Stop other DNS services.');
        console.error('[DNS] On Ubuntu/Debian: sudo systemctl stop systemd-resolved');
      }

      return false;
    }
  }

  /**
   * Stop DNS server gracefully
   */
  async stop(): Promise<boolean> {
    if (!this.isRunning || !this.server) {
      console.log('[DNS] Server not running');
      return true;
    }

    try {
      await this.server.close();
      this.server = null;
      this.isRunning = false;
      console.log('✅ [DNS] Server stopped');
      return true;
    } catch (error) {
      console.error('❌ [DNS] Failed to stop:', error);
      return false;
    }
  }

  /**
   * Restart DNS server
   */
  async restart(): Promise<boolean> {
    console.log('[DNS] Restarting server...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before restart
    return await this.start();
  }

  /**
   * Get current DNS server status
   */
  getStatus() {
    return {
      running: this.isRunning,
      port: 53,
    };
  }

  /**
   * Convert DNS query type number to name
   */
  private getQueryTypeName(type: number): string {
    const types: Record<number, string> = {
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
}

// Singleton instance
export const dnsController = new DnsController();
