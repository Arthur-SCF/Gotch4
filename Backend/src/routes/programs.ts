import { Hono } from "hono";
import type { PrismaClient } from "../generated/prisma/client.ts";
import withPrisma from "../lib/prisma.ts";
import { invalidateScopeCache } from "../lib/programScopeCache.ts";

type ContextWithPrisma = {
  Variables: {
    prisma: PrismaClient;
  };
};

const app = new Hono<ContextWithPrisma>();

// Apply prisma middleware to all routes
app.use("/*", withPrisma);

// List all programs with pagination
app.get("/", async (c) => {
  try {
    const prisma = c.get("prisma");

    // Parse pagination params — M-03: clamp to prevent full-table scans
    const page  = Math.max(1, parseInt(c.req.query("page")  || "1")  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "50") || 50));
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const total = await prisma.program.count();

    const programs = await prisma.program.findMany({
      include: {
        _count: {
          select: { events: true, files: true, payloads: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: skip,
    });

    return c.json({
      data: programs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch programs" }, 500);
  }
});

// Get single program with details
app.get("/:id", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const program = await prisma.program.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: "desc" }, take: 100 }, // M-11: cap unbounded includes
        files:  { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });

    if (!program) {
      return c.json({ error: "Program not found" }, 404);
    }

    return c.json(program);
  } catch (error) {
    return c.json({ error: "Failed to fetch program" }, 500);
  }
});

// Create program
app.post("/", async (c) => {
  try {
    const prisma = c.get("prisma");
    const body = await c.req.json();
    const { name, description, scope, notes, status } = body;

    if (!name) {
      return c.json({ error: "Name is required" }, 400);
    }

    const program = await prisma.program.create({
      data: {
        name,
        description,
        scope,
        notes,
        status: status || "active",
      },
    });

    invalidateScopeCache();
    return c.json(program, 201);
  } catch (error) {
    console.error("Error creating program:", error);
    return c.json({ error: "Failed to create program" }, 500);
  }
});

// Update program
app.put("/:id", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { name, description, scope, notes, status } = body;

    const program = await prisma.program.findUnique({ where: { id } });
    if (!program) {
      return c.json({ error: "Program not found" }, 404);
    }

    const updated = await prisma.program.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(scope !== undefined && { scope }),
        ...(notes !== undefined && { notes }),
        ...(status !== undefined && { status }),
      },
    });

    invalidateScopeCache();
    return c.json(updated);
  } catch (error) {
    console.error("Error updating program:", error);
    return c.json({ error: "Failed to update program" }, 500);
  }
});

// Delete program
app.delete("/:id", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const program = await prisma.program.findUnique({ where: { id } });

    if (!program) {
      return c.json({ error: "Program not found" }, 404);
    }

    await prisma.program.delete({ where: { id } });
    invalidateScopeCache();
    return c.json({ message: "Program deleted successfully" });
  } catch (error) {
    console.error("Error deleting program:", error);
    return c.json({ error: "Failed to delete program" }, 500);
  }
});

// Toggle favorite status
app.put("/:id/favorite", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));

    const program = await prisma.program.findUnique({ where: { id } });
    if (!program) {
      return c.json({ error: "Program not found" }, 404);
    }

    const updated = await prisma.program.update({
      where: { id },
      data: {
        isFavorite: !program.isFavorite,
      },
    });

    return c.json(updated);
  } catch (error) {
    console.error("Error toggling favorite:", error);
    return c.json({ error: "Failed to toggle favorite" }, 500);
  }
});

export default app;
