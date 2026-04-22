import { Hono } from "hono";
import type { PrismaClient } from "../generated/prisma/client.ts";
import withPrisma from "../lib/prisma.ts";

type ContextWithPrisma = {
  Variables: {
    prisma: PrismaClient;
  };
};

const app = new Hono<ContextWithPrisma>();

app.use("/*", withPrisma);

// GET /api/config/webhook-url - Returns webhook domain/URL for variable replacement
app.get("/webhook-url", async (c) => {
  // Get the webhook URL from environment or use default
  const webhookUrl = process.env.WEBHOOK_URL || "http://localhost:3000/webhook";

  // Extract domain from URL
  let webhookDomain = webhookUrl;
  try {
    const url = new URL(webhookUrl);
    webhookDomain = url.hostname;
  } catch {
    // If parsing fails, try to extract domain without protocol
    webhookDomain = webhookUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }

  return c.json({
    webhookUrl,
    webhookDomain,
  });
});

export default app;
