/**
 * Notification dispatcher — Telegram, Discord, Slack, Email (SMTP).
 *
 * Fire-and-forget: call `void sendNotification(...)` from capture handlers.
 * Reads settings from DB each call (fast indexed query).
 * Skips silently if no channels are enabled or if no program matched
 * and notifyOnAllEvents is false.
 */

import { prisma } from "./prisma.ts";
import nodemailer from "nodemailer";
import { minioClient, MINIO_BUCKET } from "./minio.ts";

export interface NotifyPayload {
  type: "http" | "dns" | "grab" | "ez";
  programId?: number | null;
  programName?: string | null;

  // Shared
  ipAddress?: string | null;

  // ── HTTP ─────────────────────────────────────────
  method?: string | null;
  fullUrl?: string | null;
  path?: string | null;
  host?: string | null;
  protocol?: string | null;
  userAgent?: string | null;
  referer?: string | null;
  contentType?: string | null;
  contentLength?: number | null;
  cookies?: string | null;
  body?: string | null;
  // Set when the HTTP hit was triggered by file detection
  detectedFilename?: string | null;

  // ── DNS ──────────────────────────────────────────
  dnsQuery?: string | null;
  dnsType?: string | null;

  // ── Grab ─────────────────────────────────────────
  grabKey?: string | null;
  grabMethod?: string | null;
  grabOrigin?: string | null;
  grabReferer?: string | null;
  grabUserAgent?: string | null;
  grabQuery?: string | null;
  grabBody?: string | null;

  // ── EZ (blind XSS) ───────────────────────────────
  ezUri?: string | null;
  ezOrigin?: string | null;
  ezCookies?: string | null;
  ezScreenshotPath?: string | null;
}

// ── Field config ──────────────────────────────────────────────────────────────

interface FieldConfig { show: boolean; redact: boolean; }

export interface NotifyFieldConfig {
  ip?:             FieldConfig;
  userAgent?:      FieldConfig;
  referer?:        FieldConfig;
  cookies?:        FieldConfig;
  body?:           FieldConfig;
  contentType?:    FieldConfig;
  contentLength?:  FieldConfig;
  grabKey?:        FieldConfig;
  grabQuery?:      FieldConfig;
  dnsQuery?:       FieldConfig;
  ezUri?:          FieldConfig;
  ezScreenshot?:   FieldConfig;
}

const FIELD_DEFAULTS: Required<NotifyFieldConfig> = {
  ip:            { show: true, redact: false },
  userAgent:     { show: true, redact: false },
  referer:       { show: true, redact: false },
  cookies:       { show: true, redact: false },
  body:          { show: true, redact: false },
  contentType:   { show: true, redact: false },
  contentLength: { show: true, redact: false },
  grabKey:       { show: true, redact: false },
  grabQuery:     { show: true, redact: false },
  dnsQuery:      { show: true, redact: false },
  ezUri:         { show: true, redact: false },
  ezScreenshot:  { show: true, redact: false },
};

// M-13: accepts unknown (Json? from Prisma returns an object; String? returned a string)
function parseFieldConfig(raw: unknown): Required<NotifyFieldConfig> {
  if (!raw) return FIELD_DEFAULTS;
  // Handle legacy string values that may exist before migration
  const obj: unknown = typeof raw === "string"
    ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
    : raw;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return FIELD_DEFAULTS;
  const parsed = obj as NotifyFieldConfig;
  const result = { ...FIELD_DEFAULTS };
  for (const k of Object.keys(FIELD_DEFAULTS) as (keyof NotifyFieldConfig)[]) {
    if (parsed[k]) result[k] = { ...FIELD_DEFAULTS[k], ...parsed[k] };
  }
  return result;
}

// Returns the display value for a field, or null if hidden/not present.
function fv(
  cfg: Required<NotifyFieldConfig>,
  key: keyof NotifyFieldConfig,
  value: string | null | undefined
): string | null {
  const f = cfg[key];
  if (!f.show || !value) return null;
  return f.redact ? "[REDACTED]" : value;
}

// ── Message building ──────────────────────────────────────────────────────────

const SEP = "─".repeat(28);
const MAX_BODY = 600;
const MAX_COOKIES = 300;
const MAX_UA = 160;

function trunc(s: string | null | undefined, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function row(label: string, value: string | null | undefined): string | null {
  if (!value) return null;
  return `${label} \`${value}\``;
}

function buildMessage(payload: NotifyPayload, cfg: Required<NotifyFieldConfig>): string {
  const time = new Date().toUTCString();
  const program = payload.programName ? `*${payload.programName}*` : "_no program_";
  const lines: (string | null)[] = [];

  // ── HTTP ─────────────────────────────────────────────────────────────────
  if (payload.type === "http") {
    if (payload.detectedFilename) {
      lines.push(`📁 *File Hit* — \`${payload.detectedFilename}\` — ${program}`);
    } else {
      lines.push(`🎯 *HTTP Capture* — ${program}`);
    }
    lines.push(SEP);

    const proto = payload.protocol ? `${payload.protocol}://` : "";
    const requestLine = `${payload.method ?? "?"} ${proto}${payload.host ?? ""}${payload.fullUrl ?? payload.path ?? ""}`;
    lines.push(`\`${requestLine}\``);
    lines.push("");

    lines.push(row("📍 IP          ", fv(cfg, "ip", payload.ipAddress)));
    lines.push(row("🖥 User-Agent  ", trunc(fv(cfg, "userAgent", payload.userAgent), MAX_UA)));
    lines.push(row("🔗 Referer     ", fv(cfg, "referer", payload.referer)));
    lines.push(row("📦 Content-Type", fv(cfg, "contentType", payload.contentType)));

    const cl = fv(cfg, "contentLength", payload.contentLength != null ? String(payload.contentLength) : null);
    if (cl) lines.push(`📏 Content-Length \`${cl === "[REDACTED]" ? cl : cl + " bytes"}\``);

    const cookies = fv(cfg, "cookies", payload.cookies);
    if (cookies) lines.push(`🍪 Cookies      \`${cookies === "[REDACTED]" ? cookies : trunc(cookies, MAX_COOKIES)}\``);

    const body = fv(cfg, "body", payload.body);
    if (body) {
      lines.push("");
      lines.push("*Body:*");
      lines.push("```");
      lines.push(body === "[REDACTED]" ? body : trunc(body, MAX_BODY));
      lines.push("```");
    }
  }

  // ── DNS ──────────────────────────────────────────────────────────────────
  else if (payload.type === "dns") {
    lines.push(`🌐 *DNS Capture* — ${program}`);
    lines.push(SEP);

    const dnsQ = fv(cfg, "dnsQuery", payload.dnsQuery);
    lines.push(`\`${dnsQ ?? "?"}\``);
    lines.push("");

    lines.push(row("📋 Type        ", payload.dnsType));
    lines.push(row("📍 IP          ", fv(cfg, "ip", payload.ipAddress)));
  }

  // ── EZ (blind XSS) ───────────────────────────────────────────────────────
  else if (payload.type === "ez") {
    lines.push(`🎭 *EZ Capture* — ${program}`);
    lines.push(SEP);

    lines.push(row("🌍 Origin      ", payload.ezOrigin));
    lines.push(row("🔗 URI         ", fv(cfg, "ezUri", payload.ezUri)));
    lines.push("");

    lines.push(row("📍 IP          ", fv(cfg, "ip", payload.ipAddress)));

    const ezCookies = fv(cfg, "cookies", payload.ezCookies);
    if (ezCookies) lines.push(`🍪 Cookies      \`${ezCookies === "[REDACTED]" ? ezCookies : trunc(ezCookies, MAX_COOKIES)}\``);
  }

  // ── Grab ─────────────────────────────────────────────────────────────────
  else {
    lines.push(`🪝 *Grab Capture* — ${program}`);
    lines.push(SEP);

    lines.push(row("🔑 Key         ", fv(cfg, "grabKey", payload.grabKey)));
    lines.push(row("📡 Method      ", payload.grabMethod));
    lines.push("");

    lines.push(row("📍 IP          ", fv(cfg, "ip", payload.ipAddress)));
    lines.push(row("🌍 Origin      ", payload.grabOrigin));
    lines.push(row("🔗 Referer     ", fv(cfg, "referer", payload.grabReferer)));
    lines.push(row("🖥 User-Agent  ", trunc(fv(cfg, "userAgent", payload.grabUserAgent), MAX_UA)));

    const grabQ = fv(cfg, "grabQuery", payload.grabQuery);
    if (grabQ) {
      lines.push("");
      lines.push("*Query Params:*");
      lines.push(`\`${grabQ}\``);
    }

    const grabB = fv(cfg, "body", payload.grabBody);
    if (grabB) {
      lines.push("");
      lines.push("*Body:*");
      lines.push("```");
      lines.push(grabB === "[REDACTED]" ? grabB : trunc(grabB, MAX_BODY));
      lines.push("```");
    }
  }

  lines.push("");
  lines.push(`⏱ ${time}`);

  return lines.filter((l) => l !== null).join("\n");
}

// ── Channel senders ───────────────────────────────────────────────────────────

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  if (!res.ok) console.error("[Notify] Telegram error:", await res.text());
}

async function sendTelegramPhoto(token: string, chatId: string, imageBuffer: Buffer): Promise<void> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "screenshot.png");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) console.error("[Notify] Telegram photo error:", await res.text());
}

async function downloadFromMinio(path: string): Promise<Buffer | null> {
  try {
    const stream = await minioClient.getObject(MINIO_BUCKET, path);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  } catch (e) {
    console.error("[Notify] Failed to download screenshot from MinIO:", e);
    return null;
  }
}

async function sendDiscord(webhookUrl: string, text: string): Promise<void> {
  const content = text.length > 1990 ? text.slice(0, 1990) + "\n…" : text;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) console.error("[Notify] Discord error:", await res.text());
}

async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  const content = text.length > 3000 ? text.slice(0, 3000) + "\n…" : text;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: content }),
  });
  if (!res.ok) console.error("[Notify] Slack error:", await res.text());
}

async function sendEmail(
  host: string,
  port: number,
  user: string,
  pass: string,
  from: string,
  to: string,
  subject: string,
  text: string
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({ from, to, subject, text });
}

// ── Custom template rendering ──────────────────────────────────────────────────

type TemplateMap = { http?: string; dns?: string; grab?: string; ez?: string };

// M-13: accepts unknown (Json? from Prisma returns an object; String? returned a string)
function parseTemplateMap(raw: unknown): TemplateMap {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as TemplateMap; } catch { return {}; }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as TemplateMap;
  return {};
}

function renderTemplate(template: string, payload: NotifyPayload): string {
  const time = new Date().toUTCString();
  const vars: Record<string, string> = {
    // Common
    PROGRAM:        payload.programName   ?? "",
    IP:             payload.ipAddress     ?? "",
    TIME:           time,
    // HTTP / File hit
    METHOD:         payload.method        ?? "",
    FILENAME:       payload.detectedFilename ?? "",
    HOST:           payload.host          ?? "",
    URL:            payload.fullUrl       ?? payload.path ?? "",
    PROTOCOL:       payload.protocol      ?? "",
    USER_AGENT:     payload.userAgent     ?? "",
    REFERER:        payload.referer       ?? "",
    CONTENT_TYPE:   payload.contentType   ?? "",
    CONTENT_LENGTH: payload.contentLength != null ? String(payload.contentLength) : "",
    COOKIES:        payload.cookies       ?? "",
    BODY:           payload.body          ?? "",
    // DNS
    DNS_QUERY:      payload.dnsQuery      ?? "",
    DNS_TYPE:       payload.dnsType       ?? "",
    // Grab
    GRAB_KEY:       payload.grabKey       ?? "",
    GRAB_METHOD:    payload.grabMethod    ?? "",
    GRAB_ORIGIN:    payload.grabOrigin    ?? "",
    GRAB_REFERER:   payload.grabReferer   ?? "",
    GRAB_UA:        payload.grabUserAgent ?? "",
    GRAB_QUERY:     payload.grabQuery     ?? "",
    GRAB_BODY:      payload.grabBody      ?? "",
    // EZ
    EZ_ORIGIN:      payload.ezOrigin      ?? "",
    EZ_URI:         payload.ezUri         ?? "",
    EZ_COOKIES:     payload.ezCookies     ?? "",
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function sendNotification(payload: NotifyPayload): Promise<void> {
  try {
    const settings = await prisma.settings.findFirst({
      select: {
        telegramEnabled: true,
        telegramBotToken: true,
        telegramChatId: true,
        discordEnabled: true,
        discordWebhookUrl: true,
        slackEnabled: true,
        slackWebhookUrl: true,
        emailEnabled: true,
        emailSmtpHost: true,
        emailSmtpPort: true,
        emailSmtpUser: true,
        emailSmtpPass: true,
        emailFrom: true,
        emailTo: true,
        notifyOnAllEvents: true,
        notifyFieldConfig: true,
        notifyTemplate: true,
      },
    });

    if (!settings) return;

    const anyEnabled =
      settings.telegramEnabled ||
      settings.discordEnabled ||
      settings.slackEnabled ||
      settings.emailEnabled;
    if (!anyEnabled) return;

    if (!settings.notifyOnAllEvents && !payload.programId) return;

    // Use custom template if defined for this event type, otherwise build default message
    const templateMap = parseTemplateMap(settings.notifyTemplate);
    const customTemplate = templateMap[payload.type];
    const cfg = parseFieldConfig(settings.notifyFieldConfig);
    const text = customTemplate
      ? renderTemplate(customTemplate, payload)
      : buildMessage(payload, cfg);
    const subject = `[Capture] ${payload.type.toUpperCase()} — ${payload.programName ?? "no program"}`;
    const sends: Promise<void>[] = [];

    if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
      sends.push(sendTelegram(settings.telegramBotToken, settings.telegramChatId, text));
      // Send screenshot as a separate photo message if enabled and available
      if (
        payload.type === "ez" &&
        payload.ezScreenshotPath &&
        cfg.ezScreenshot?.show !== false
      ) {
        sends.push(
          downloadFromMinio(payload.ezScreenshotPath).then((buf) => {
            if (buf) return sendTelegramPhoto(settings.telegramBotToken!, settings.telegramChatId!, buf);
          }).then(() => {})
        );
      }
    }
    if (settings.discordEnabled && settings.discordWebhookUrl) {
      sends.push(sendDiscord(settings.discordWebhookUrl, text));
    }
    if (settings.slackEnabled && settings.slackWebhookUrl) {
      sends.push(sendSlack(settings.slackWebhookUrl, text));
    }
    if (
      settings.emailEnabled &&
      settings.emailSmtpHost &&
      settings.emailSmtpUser &&
      settings.emailSmtpPass &&
      settings.emailFrom &&
      settings.emailTo
    ) {
      sends.push(
        sendEmail(
          settings.emailSmtpHost,
          settings.emailSmtpPort ?? 587,
          settings.emailSmtpUser,
          settings.emailSmtpPass,
          settings.emailFrom,
          settings.emailTo,
          subject,
          // Strip markdown for email plain text
          text.replace(/\*/g, "").replace(/`/g, "")
        )
      );
    }

    if (sends.length > 0) await Promise.allSettled(sends);
  } catch (e) {
    console.error("[Notify] Failed to send notification:", e);
  }
}
