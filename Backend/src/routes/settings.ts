import { Hono } from 'hono';
import type { PrismaClient } from '../generated/prisma/client.ts';
import { promises as dns } from 'dns'; // M-10: top-level ESM import instead of require() inside handler
import { dnsController } from '../lib/dnsController.ts';
import { getLastCallbackAt } from './dnsCallback.ts';
import { validateDnsSettings, sanitizeString, validateUrl, validateDomain, validateIpAddress } from '../lib/validators.ts';
import withPrisma, { prisma } from '../lib/prisma.ts';
import { setWebhookPath } from '../lib/webhookState.ts';
import { setDnsState } from '../lib/dnsState.ts';

const app = new Hono<{ Variables: { prisma: PrismaClient } }>();

// Apply prisma middleware to all routes
app.use('/*', withPrisma);

// ── NS record cache (5-minute TTL) ────────────────────────────────────────────
const nsCache = new Map<string, { configured: boolean; at: number }>();
const NS_CACHE_TTL = 5 * 60 * 1000;

async function checkNsConfigured(domain: string): Promise<boolean> {
  const cached = nsCache.get(domain);
  if (cached && Date.now() - cached.at < NS_CACHE_TTL) return cached.configured;
  try {
    const records = await dns.resolveNs(domain);
    const configured = records.length > 0;
    nsCache.set(domain, { configured, at: Date.now() });
    return configured;
  } catch {
    nsCache.set(domain, { configured: false, at: Date.now() });
    return false;
  }
}

// Get all settings (creates default if none exist)
app.get('/api/settings', async (c) => {
  let settings = await c.var.prisma.settings.findFirst();

  // Create default settings if none exist (singleton pattern)
  if (!settings) {
    settings = await c.var.prisma.settings.create({
      data: {
        dnsEnabled: false,
        dnsMode: 'local',
        webhookUrl: process.env.WEBHOOK_URL || 'http://localhost:3000/webhook',
      },
    });
  }

  // H-03: Mask sensitive fields — never return secrets in plaintext
  return c.json({
    ...settings,
    telegramBotToken: settings.telegramBotToken ? '***' : null,
    emailSmtpPass: settings.emailSmtpPass ? '***' : null,
    dnsAuthToken: settings.dnsAuthToken ? '***' : null,
    discordWebhookUrl: settings.discordWebhookUrl ? '***' : null,
    slackWebhookUrl: settings.slackWebhookUrl ? '***' : null,
  });
});

// Update DNS settings with comprehensive validation
app.put('/api/settings/dns', async (c) => {
  try {
    const body = await c.req.json();

    // Validate input using comprehensive validation rules
    const validationResult = validateDnsSettings({
      dnsMode: body.dnsMode,
      dnsBaseDomain: body.dnsBaseDomain,
      dnsResponseIp: body.dnsResponseIp,
      dnsTtl: body.dnsTtl,
      dnsVpsUrl: body.dnsVpsUrl,
      dnsWebhookUrl: body.dnsWebhookUrl,
      dnsAuthToken: body.dnsAuthToken,
    });

    // If validation fails, return detailed error messages
    if (!validationResult.isValid) {
      return c.json({
        error: 'Validation failed',
        details: validationResult.errors,
      }, 400);
    }

    let settings = await c.var.prisma.settings.findFirst();

    // Create default settings if none exist
    if (!settings) {
      settings = await c.var.prisma.settings.create({
        data: {
          dnsEnabled: false,
          dnsMode: 'local',
          webhookUrl: process.env.WEBHOOK_URL || 'http://localhost:3000/webhook',
        },
      });
    }

    // Sanitize all string inputs before database update
    const sanitizedData = {
      dnsMode: body.dnsMode || settings.dnsMode,
      dnsBaseDomain: sanitizeString(body.dnsBaseDomain),
      dnsResponseIp: sanitizeString(body.dnsResponseIp),
      dnsTtl: body.dnsTtl !== undefined ? body.dnsTtl : settings.dnsTtl,
      dnsVpsUrl: sanitizeString(body.dnsVpsUrl),
      dnsWebhookUrl: sanitizeString(body.dnsWebhookUrl),
      // Skip if '***' sentinel — means client loaded the masked value and didn't change it
      ...(body.dnsAuthToken && body.dnsAuthToken !== '***' && { dnsAuthToken: sanitizeString(body.dnsAuthToken) }),
    };

    // Update settings with sanitized data
    const updated = await c.var.prisma.settings.update({
      where: { id: settings.id },
      data: sanitizedData,
    });

    // Keep in-memory DNS state in sync
    setDnsState(updated.dnsEnabled, updated.dnsBaseDomain);

    return c.json(updated);
  } catch (error: any) {
    console.error('[Settings] Update error:', error);
    return c.json({ error: 'Failed to update DNS settings' }, 500);
  }
});

// Toggle DNS on/off with validation
app.post('/api/settings/dns/toggle', async (c) => {
  let settings = await c.var.prisma.settings.findFirst();

  // Require settings to exist before toggling
  if (!settings) {
    return c.json({
      error: 'Please configure DNS settings first (click Save Changes)',
      enabled: false,
      status: { running: false, port: 53 },
    }, 400);
  }

  const newState = !settings.dnsEnabled;

  // If enabling DNS, validate that all required fields are properly configured
  if (newState) {
    const validationResult = validateDnsSettings({
      dnsMode: settings.dnsMode as 'local' | 'remote',
      dnsBaseDomain: settings.dnsBaseDomain || undefined,
      dnsResponseIp: settings.dnsResponseIp || undefined,
      dnsTtl: settings.dnsTtl || 0,
      dnsVpsUrl: settings.dnsVpsUrl || undefined,
      dnsWebhookUrl: settings.dnsWebhookUrl || undefined,
      dnsAuthToken: settings.dnsAuthToken || undefined,
    });

    if (!validationResult.isValid) {
      return c.json({
        error: 'Cannot enable DNS: Configuration validation failed',
        details: validationResult.errors,
        enabled: false,
        status: { running: false, port: 53 },
      }, 400);
    }
  }

  // Update database
  await c.var.prisma.settings.update({
    where: { id: settings.id },
    data: { dnsEnabled: newState },
  });

  // Keep in-memory DNS state in sync
  setDnsState(newState, settings.dnsBaseDomain);

  if (newState) {
    // Remote mode: no local DNS server to start, just save the enabled state
    if (settings.dnsMode !== 'local') {
      return c.json({
        enabled: true,
        status: dnsController.getStatus(),
      });
    }

    // Local mode: start DNS asynchronously so we don't block the HTTP response.
    // dns2's server.listen() Promise can hang in Bun even when the server starts
    // successfully. The client polls /api/settings/dns/status every 5s for live state.
    const settingsId = settings.id;
    dnsController.start().then((started) => {
      if (!started) {
        // DNS failed to start — roll back dnsEnabled in DB
        prisma.settings.update({
          where: { id: settingsId },
          data: { dnsEnabled: false },
        }).catch((e) => console.error('[DNS] Rollback failed:', e));
      }
    }).catch((e) => {
      console.error('[DNS] start() threw:', e);
      prisma.settings.update({
        where: { id: settingsId },
        data: { dnsEnabled: false },
      }).catch((rb) => console.error('[DNS] Rollback failed:', rb));
    });
  } else {
    // Disable: Stop DNS server
    await dnsController.stop();
  }

  return c.json({
    enabled: newState,
    status: dnsController.getStatus(),
  });
});

// Test DNS configuration
app.post('/api/settings/dns/test', async (c) => {
  let domain: string;
  try {
    const body = await c.req.json();
    domain = body.domain;
  } catch {
    return c.json({ success: false, error: 'Invalid request body' }, 400);
  }

  if (!domain || typeof domain !== 'string' || !validateDomain(domain)) {
    return c.json({ success: false, error: 'Invalid domain format' }, 400);
  }

  // Test by resolving a random subdomain — this exercises the full delegation
  // chain (registrar NS → VPS DNS server) and shows up in VPS logs.
  const testLabel = `gotch4-test-${Math.random().toString(36).slice(2, 10)}`;
  const testFqdn = `${testLabel}.${domain}`;

  try {
    const addresses = await dns.resolve4(testFqdn);
    return c.json({
      success: true,
      message: 'DNS configuration looks good!',
      resolvedTo: addresses[0],
      testQuery: testFqdn,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.code,
      testQuery: testFqdn,
      message: error.code === 'ENOTFOUND' || error.code === 'ESERVFAIL'
        ? 'Could not resolve test subdomain. Make sure your NS records are configured at the registrar and the VPS DNS server is running.'
        : 'DNS test failed. Check VPS DNS server logs.',
    });
  }
});

// Get DNS server status
app.get('/api/settings/dns/status', async (c) => {
  const settings = await c.var.prisma.settings.findFirst();
  const serverStatus = dnsController.getStatus();

  let nsConfigured = false;
  if (settings?.dnsBaseDomain) {
    // In remote mode the NS delegation check is unreliable from inside Docker;
    // the VPS being reachable (auth token configured) is the real indicator.
    if (settings.dnsMode === 'remote') {
      nsConfigured = !!settings.dnsAuthToken;
    } else {
      nsConfigured = await checkNsConfigured(settings.dnsBaseDomain);
    }
  }

  // In remote mode the local dnsController is never started — the VPS handles DNS.
  // "running" = true only after at least one successful callback has been received.
  const isRemote = (settings?.dnsMode ?? 'local') === 'remote';
  const running = isRemote
    ? getLastCallbackAt() !== null
    : serverStatus.running;

  return c.json({
    configured: !!settings?.dnsBaseDomain,
    enabled: settings?.dnsEnabled || false,
    running,
    mode: settings?.dnsMode || 'local',
    domain: settings?.dnsBaseDomain,
    responseIp: settings?.dnsResponseIp,
    nsConfigured,
    lastCallbackAt: getLastCallbackAt()?.toISOString() ?? null,
  });
});

// Update webhook capture path
app.put('/api/settings/webhook', async (c) => {
  try {
    const { webhookPath } = await c.req.json();

    // Validate: only letters, numbers, hyphens, underscores — no slashes
    if (!webhookPath || !/^[a-zA-Z0-9_-]+$/.test(webhookPath)) {
      return c.json({
        error: 'Invalid webhook path. Use only letters, numbers, hyphens, and underscores (e.g. "webhook", "flag", "capture").',
      }, 400);
    }

    // Block reserved backend API routes and frontend SPA routes
    const RESERVED = new Set([
      'api', 'grab', 'ez',                      // backend routes
      'files', 'programs', 'settings', 'auth',  // frontend top-level routes
      'security', 'tools',                       // frontend route groups
    ]);
    if (RESERVED.has(webhookPath.toLowerCase())) {
      return c.json({
        error: `"${webhookPath}" is a reserved path. Choose a different name (e.g. "capture", "ping", "flag").`,
      }, 400);
    }

    let settings = await c.var.prisma.settings.findFirst();
    if (!settings) {
      settings = await c.var.prisma.settings.create({
        data: { webhookPath, webhookUrl: `${process.env.WEBHOOK_URL?.replace(/\/webhook$/, '') || 'http://localhost:3000'}/${webhookPath}` },
      });
    } else {
      settings = await c.var.prisma.settings.update({
        where: { id: settings.id },
        data: { webhookPath },
      });
    }

    // Update the in-memory route immediately — no restart needed
    setWebhookPath(webhookPath);

    return c.json({ webhookPath: settings.webhookPath });
  } catch (error) {
    console.error('[Settings] Webhook path update error:', error);
    return c.json({ error: 'Failed to update webhook path' }, 500);
  }
});

// ── Notification settings ─────────────────────────────────────────────────────

// Get notification settings (sensitive tokens/passwords are masked in response)
app.get('/api/settings/notifications', async (c) => {
  const settings = await c.var.prisma.settings.findFirst();
  if (!settings) {
    return c.json({
      telegramEnabled: false, telegramBotToken: null, telegramChatId: null,
      discordEnabled: false, discordWebhookUrl: null,
      slackEnabled: false, slackWebhookUrl: null,
      emailEnabled: false, emailSmtpHost: null, emailSmtpPort: 587,
      emailSmtpUser: null, emailSmtpPass: null, emailFrom: null, emailTo: null,
      notifyOnAllEvents: false, notifyFieldConfig: null,
    });
  }
  return c.json({
    telegramEnabled: settings.telegramEnabled,
    telegramBotToken: settings.telegramBotToken ? '***' : null,
    telegramChatId: settings.telegramChatId,
    discordEnabled: settings.discordEnabled,
    discordWebhookUrl: settings.discordWebhookUrl ? '***' : null,
    slackEnabled: settings.slackEnabled,
    slackWebhookUrl: settings.slackWebhookUrl ? '***' : null,
    emailEnabled: settings.emailEnabled,
    emailSmtpHost: settings.emailSmtpHost,
    emailSmtpPort: settings.emailSmtpPort,
    emailSmtpUser: settings.emailSmtpUser,
    emailSmtpPass: settings.emailSmtpPass ? '***' : null,
    emailFrom: settings.emailFrom,
    emailTo: settings.emailTo,
    notifyOnAllEvents: settings.notifyOnAllEvents,
    notifyFieldConfig: settings.notifyFieldConfig ?? null,
    notifyTemplate: settings.notifyTemplate ?? null,
  });
});

// Update notification settings
app.put('/api/settings/notifications', async (c) => {
  try {
    const body = await c.req.json();
    const {
      telegramEnabled, telegramBotToken, telegramChatId,
      discordEnabled, discordWebhookUrl,
      slackEnabled, slackWebhookUrl,
      emailEnabled, emailSmtpHost, emailSmtpPort, emailSmtpUser, emailSmtpPass,
      emailFrom, emailTo,
      notifyOnAllEvents, notifyFieldConfig, notifyTemplate,
    } = body;

    // C-03: SSRF prevention — validate webhook URLs and SMTP host before saving
    // Skip validation for '***' (masked sentinel) and '' (no-op update)
    if (discordWebhookUrl !== undefined && discordWebhookUrl !== null && discordWebhookUrl !== '' && discordWebhookUrl !== '***' && !validateUrl(discordWebhookUrl)) {
      return c.json({ error: 'Invalid Discord webhook URL' }, 400);
    }
    if (slackWebhookUrl !== undefined && slackWebhookUrl !== null && slackWebhookUrl !== '' && slackWebhookUrl !== '***' && !validateUrl(slackWebhookUrl)) {
      return c.json({ error: 'Invalid Slack webhook URL' }, 400);
    }
    if (emailSmtpHost !== undefined && emailSmtpHost !== null && emailSmtpHost !== '' &&
        !validateDomain(emailSmtpHost) && !validateIpAddress(emailSmtpHost)) {
      return c.json({ error: 'Invalid SMTP host' }, 400);
    }

    let settings = await c.var.prisma.settings.findFirst();
    if (!settings) {
      settings = await c.var.prisma.settings.create({
        data: { dnsEnabled: false, dnsMode: 'local', webhookUrl: process.env.WEBHOOK_URL || 'http://localhost:3000/webhook' },
      });
    }

    await c.var.prisma.settings.update({
      where: { id: settings.id },
      data: {
        ...(telegramEnabled !== undefined && { telegramEnabled }),
        ...(telegramBotToken !== undefined && telegramBotToken !== '***' && telegramBotToken !== '' && { telegramBotToken }),
        ...(telegramChatId !== undefined && { telegramChatId }),
        ...(discordEnabled !== undefined && { discordEnabled }),
        ...(discordWebhookUrl !== undefined && discordWebhookUrl !== '***' && discordWebhookUrl !== '' && { discordWebhookUrl }),
        ...(slackEnabled !== undefined && { slackEnabled }),
        ...(slackWebhookUrl !== undefined && slackWebhookUrl !== '***' && slackWebhookUrl !== '' && { slackWebhookUrl }),
        ...(emailEnabled !== undefined && { emailEnabled }),
        ...(emailSmtpHost !== undefined && { emailSmtpHost }),
        ...(emailSmtpPort !== undefined && { emailSmtpPort: Number(emailSmtpPort) }),
        ...(emailSmtpUser !== undefined && { emailSmtpUser }),
        ...(emailSmtpPass !== undefined && emailSmtpPass !== '***' && emailSmtpPass !== '' && { emailSmtpPass }),
        ...(emailFrom !== undefined && { emailFrom }),
        ...(emailTo !== undefined && { emailTo }),
        ...(notifyOnAllEvents !== undefined && { notifyOnAllEvents }),
        ...(notifyFieldConfig !== undefined && { notifyFieldConfig }),
        ...(notifyTemplate !== undefined && { notifyTemplate }),
      },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('[Settings] Notification update error:', error);
    return c.json({ error: 'Failed to update notification settings' }, 500);
  }
});

// Send a test notification to all enabled channels
app.post('/api/settings/notifications/test', async (c) => {
  try {
    const { sendNotification } = await import('../lib/notify.js');
    await sendNotification({
      type: 'http',
      programId: 1,
      programName: 'Test Program',
      method: 'GET',
      path: '/test',
      host: 'test.example.com',
      ipAddress: '1.2.3.4',
    });
    return c.json({ success: true, message: 'Test notification sent to all enabled channels' });
  } catch (error: any) {
    console.error('[Settings] Test notification error:', error);
    return c.json({ error: 'Failed to send test notification', message: error.message }, 500);
  }
});

// ── EZ Capture Settings ───────────────────────────────────────────────────────

app.get('/api/settings/ez', async (c) => {
  const settings = await c.var.prisma.settings.findFirst();
  return c.json({
    ezCollectDom:            settings?.ezCollectDom            ?? true,
    ezCollectCookies:        settings?.ezCollectCookies        ?? true,
    ezCollectLocalStorage:   settings?.ezCollectLocalStorage   ?? true,
    ezCollectSessionStorage: settings?.ezCollectSessionStorage ?? true,
    ezCollectScreenshot:     settings?.ezCollectScreenshot     ?? false,
  });
});

app.put('/api/settings/ez', async (c) => {
  try {
    const body = await c.req.json();
    const data = {
      ezCollectDom:            typeof body.ezCollectDom            === 'boolean' ? body.ezCollectDom            : undefined,
      ezCollectCookies:        typeof body.ezCollectCookies        === 'boolean' ? body.ezCollectCookies        : undefined,
      ezCollectLocalStorage:   typeof body.ezCollectLocalStorage   === 'boolean' ? body.ezCollectLocalStorage   : undefined,
      ezCollectSessionStorage: typeof body.ezCollectSessionStorage === 'boolean' ? body.ezCollectSessionStorage : undefined,
      ezCollectScreenshot:     typeof body.ezCollectScreenshot     === 'boolean' ? body.ezCollectScreenshot     : undefined,
    };
    // Remove undefined keys
    const cleanData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

    let settings = await c.var.prisma.settings.findFirst();
    if (!settings) {
      settings = await c.var.prisma.settings.create({ data: { ...cleanData, webhookUrl: process.env.WEBHOOK_URL || 'http://localhost:3000/webhook' } });
    } else {
      settings = await c.var.prisma.settings.update({ where: { id: settings.id }, data: cleanData });
    }
    return c.json({
      ezCollectDom:            settings.ezCollectDom,
      ezCollectCookies:        settings.ezCollectCookies,
      ezCollectLocalStorage:   settings.ezCollectLocalStorage,
      ezCollectSessionStorage: settings.ezCollectSessionStorage,
      ezCollectScreenshot:     settings.ezCollectScreenshot,
    });
  } catch (error: any) {
    console.error('[Settings] EZ update error:', error);
    return c.json({ error: 'Failed to update EZ settings' }, 500);
  }
});

export default app;
