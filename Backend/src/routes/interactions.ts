import { Hono } from "hono";
import type { PrismaClient } from "../generated/prisma/client.ts";
import withPrisma from "../lib/prisma.ts";
import {
  DnsGrammarError,
  isRebindStrategy,
  mintToken,
  REBIND_STRATEGIES,
  type RebindStrategy,
} from "../lib/dnsEngine.ts";
import { buildRebindLabel } from "../lib/dnsAnswer.ts";
import { SSRF_TARGETS } from "../lib/ssrfTargets.ts";
import { resolveDefaultAttackerIp } from "../lib/dnsDefaults.ts";

/**
 * Interaction-token API for the blind-SSRF / DNS toolkit.
 *
 * A token is minted here, embedded in a payload hostname, then parsed back out
 * of BOTH the DNS query name and the HTTP Host header so a DNS lookup and its
 * follow-up HTTP hit correlate to one interaction (and can auto-assign to a
 * program). Auth-gated by the global `/api/*` Keycloak middleware in index.ts —
 * this is the open-rebinder guard: only dashboard users can mint tokens.
 */

const app = new Hono<{ Variables: { prisma: PrismaClient } }>();
app.use("/*", withPrisma);

const NOTE_MAX = 500;

async function readJsonObject(
  raw: Promise<unknown>,
): Promise<Record<string, unknown>> {
  try {
    const parsed = await raw;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (e) {
    // Tolerate an empty/malformed body (all fields optional); anything else propagates.
    if (e instanceof SyntaxError) return {};
    throw e;
  }
}

// POST /api/interactions/tokens — mint a correlation token (optionally linked to a program).
app.post("/tokens", async (c) => {
  const input = await readJsonObject(c.req.json());

  let programId: number | null = null;
  if (input.programId !== undefined && input.programId !== null) {
    const pid = Number(input.programId);
    if (!Number.isInteger(pid) || pid <= 0) {
      return c.json({ error: "programId must be a positive integer" }, 400);
    }
    programId = pid;
  }

  let strategy: RebindStrategy | null = null;
  if (
    input.strategy !== undefined &&
    input.strategy !== null &&
    input.strategy !== ""
  ) {
    if (!isRebindStrategy(input.strategy)) {
      return c.json(
        { error: `strategy must be one of: ${REBIND_STRATEGIES.join(", ")}` },
        400,
      );
    }
    strategy = input.strategy;
  }

  const note =
    typeof input.note === "string" && input.note.trim()
      ? input.note.trim().slice(0, NOTE_MAX)
      : null;

  const token = mintToken();
  await c.var.prisma.interactionToken.create({
    data: { token, programId, strategy, note },
  });

  const settings = await c.var.prisma.settings.findFirst();
  const baseDomain = settings?.dnsBaseDomain ?? null;

  return c.json({
    token,
    baseDomain,
    hostname: baseDomain ? `${token}.${baseDomain}` : null,
    programId,
    strategy,
  });
});

// GET /api/interactions/tokens — list recently minted tokens (for the DNS toolkit UI).
app.get("/tokens", async (c) => {
  const tokens = await c.var.prisma.interactionToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { program: { select: { id: true, name: true } } },
  });
  return c.json({ data: tokens });
});

// GET /api/interactions/targets — curated internal rebind targets for the generator UI.
app.get("/targets", (c) => c.json({ data: SSRF_TARGETS }));

// POST /api/interactions/rebind — mint a token and build a signed rebinding hostname.
// The HMAC secret (dnsAuthToken) never leaves the server, so the label cannot be forged.
app.post("/rebind", async (c) => {
  const input = await readJsonObject(c.req.json());
  const settings = await c.var.prisma.settings.findFirst();
  const secret = settings?.dnsAuthToken ?? "";
  const baseDomain = settings?.dnsBaseDomain ?? null;

  if (!baseDomain) return c.json({ error: "Configure the DNS base domain first" }, 400);
  if (!secret) {
    return c.json(
      { error: "Set a DNS authentication token before generating rebind payloads" },
      400,
    );
  }

  const targetIp = typeof input.targetIp === "string" ? input.targetIp.trim() : "";
  if (!targetIp) return c.json({ error: "targetIp is required" }, 400);

  if (!isRebindStrategy(input.strategy)) {
    return c.json({ error: `strategy must be one of: ${REBIND_STRATEGIES.join(", ")}` }, 400);
  }
  const strategy: RebindStrategy = input.strategy;

  const attackerIp =
    (typeof input.attackerIp === "string" && input.attackerIp.trim()) ||
    resolveDefaultAttackerIp(settings?.dnsResponseIp, settings?.dnsVpsUrl) ||
    "";
  if (!attackerIp) {
    return c.json(
      { error: "attackerIp is required (no dnsResponseIp or IP-form dnsVpsUrl to default from)" },
      400,
    );
  }

  let programId: number | null = null;
  if (input.programId !== undefined && input.programId !== null) {
    const pid = Number(input.programId);
    if (!Number.isInteger(pid) || pid <= 0) {
      return c.json({ error: "programId must be a positive integer" }, 400);
    }
    programId = pid;
  }
  const note =
    typeof input.note === "string" && input.note.trim()
      ? input.note.trim().slice(0, NOTE_MAX)
      : null;

  const token = mintToken();
  let label: string;
  try {
    label = buildRebindLabel(attackerIp, targetIp, strategy, token, secret);
  } catch (e) {
    if (e instanceof DnsGrammarError) {
      return c.json({ error: `Invalid IPv4 address: ${e.message}` }, 400);
    }
    throw e;
  }

  await c.var.prisma.interactionToken.create({ data: { token, programId, strategy, note } });

  return c.json({
    token,
    hostname: `${label}.${baseDomain}`,
    attackerIp,
    targetIp,
    strategy,
    programId,
  });
});

export default app;
