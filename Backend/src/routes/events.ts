import { Hono } from "hono";
import type { PrismaClient } from "../generated/prisma/client.ts";
import withPrisma from "../lib/prisma.ts";

type ContextWithPrisma = {
  Variables: {
    prisma: PrismaClient;
  };
};

const app = new Hono<ContextWithPrisma>();

// Apply prisma middleware to all routes
app.use("/*", withPrisma);

// List all captured events with pagination
app.get("/", async (c) => {
  try {
    const prisma = c.get("prisma");

    // Parse pagination params — M-03: clamp to prevent full-table scans
    const page  = Math.max(1, parseInt(c.req.query("page")  || "1")  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "50") || 50));
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const total = await prisma.event.count();

    const events = await prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: skip,
    });

    return c.json({
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch events" }, 500);
  }
});

// Get single event
app.get("/:id", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const event = await prisma.event.findUnique({ where: { id } });

    if (!event) {
      return c.json({ error: "Event not found" }, 404);
    }

    return c.json(event);
  } catch (error) {
    return c.json({ error: "Failed to fetch event" }, 500);
  }
});

// Delete event
app.delete("/:id", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const event = await prisma.event.findUnique({ where: { id } });

    if (!event) {
      return c.json({ error: "Event not found" }, 404);
    }

    await prisma.event.delete({ where: { id } });
    return c.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    return c.json({ error: "Failed to delete event" }, 500);
  }
});

// Delete all events
app.delete("/", async (c) => {
  try {
    const prisma = c.get("prisma");
    await prisma.event.deleteMany({});
    return c.json({ message: "All events deleted successfully" });
  } catch (error) {
    console.error("Error deleting events:", error);
    return c.json({ error: "Failed to delete events" }, 500);
  }
});

// Bulk delete events by IDs
app.post("/bulk-delete", async (c) => {
  try {
    const prisma = c.get("prisma");
    const body = await c.req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "ids array is required and must not be empty" }, 400);
    }

    // Convert to integers and validate
    const eventIds = ids.map((id) => parseInt(id)).filter((id) => !isNaN(id));

    if (eventIds.length === 0) {
      return c.json({ error: "No valid event IDs provided" }, 400);
    }

    const result = await prisma.event.deleteMany({
      where: {
        id: {
          in: eventIds,
        },
      },
    });

    return c.json({
      message: "Events deleted successfully",
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("Error bulk deleting events:", error);
    return c.json({ error: "Failed to bulk delete events" }, 500);
  }
});

// Link event to program
app.put("/:id/program", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { programId } = body;

    const event = await prisma.event.update({
      where: { id },
      data: { programId: programId || null },
    });

    return c.json(event);
  } catch (error) {
    console.error("Error linking event to program:", error);
    return c.json({ error: "Failed to link event to program" }, 500);
  }
});

// Update event notes
app.put("/:id/notes", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { notes } = body;

    const event = await prisma.event.update({
      where: { id },
      data: { notes: notes || null },
    });

    return c.json(event);
  } catch (error) {
    console.error("Error updating event notes:", error);
    return c.json({ error: "Failed to update event notes" }, 500);
  }
});

export default app;
