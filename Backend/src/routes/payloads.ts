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

// GET /api/payloads - List all payloads with filters and pagination
app.get("/", async (c) => {
  const categoryId = c.req.query("categoryId");
  const isFavorite = c.req.query("favorite");
  const search = c.req.query("search");
  const programId = c.req.query("programId");

  // Parse pagination params
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "50");
  const skip = (page - 1) * limit;

  const where: any = {};

  if (categoryId) {
    where.categoryId = parseInt(categoryId);
  }

  if (isFavorite === "true") {
    where.isFavorite = true;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { tags: { contains: search, mode: "insensitive" } },
    ];
  }

  if (programId) {
    where.programId = parseInt(programId);
  }

  // Get total count for pagination metadata
  const total = await c.var.prisma.payload.count({ where });

  const payloads = await c.var.prisma.payload.findMany({
    where,
    include: {
      category: true,
      program: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: skip,
  });

  return c.json({
    data: payloads,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /api/payloads/export - Export all payloads and categories
app.get("/export", async (c) => {
  const categories = await c.var.prisma.payloadCategory.findMany({
    orderBy: { order: "asc" },
  });

  const payloads = await c.var.prisma.payload.findMany({
    include: {
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const exportData = {
    version: "1.0",
    exportDate: new Date().toISOString(),
    categories: categories.map((cat: any) => ({
      name: cat.name,
      description: cat.description,
      color: cat.color,
      order: cat.order,
    })),
    payloads: payloads.map((payload: any) => ({
      name: payload.name,
      content: payload.content,
      description: payload.description,
      categoryName: payload.category.name,
      tags: payload.tags,
      isFavorite: payload.isFavorite,
    })),
  };

  return c.json(exportData);
});

// POST /api/payloads/import - Import payloads from JSON
app.post("/import", async (c) => {
  const body = await c.req.json();

  if (!body.version || !body.categories || !body.payloads) {
    return c.json({ error: "Invalid import format" }, 400);
  }

  const mode = body.mode || "merge"; // "replace", "merge", or "merge-update"

  try {
    const results = {
      categoriesCreated: 0,
      categoriesUpdated: 0,
      payloadsCreated: 0,
      payloadsUpdated: 0,
      payloadsSkipped: 0,
    };

    // If replace mode, delete all existing data
    if (mode === "replace") {
      await c.var.prisma.payload.deleteMany({});
      await c.var.prisma.payloadCategory.deleteMany({});
    }

    // Import categories
    const categoryMap = new Map<string, number>();

    for (const catData of body.categories) {
      const existing = await c.var.prisma.payloadCategory.findUnique({
        where: { name: catData.name },
      });

      if (existing) {
        if (mode === "merge-update") {
          await c.var.prisma.payloadCategory.update({
            where: { id: existing.id },
            data: {
              description: catData.description,
              color: catData.color,
              order: catData.order,
            },
          });
          results.categoriesUpdated++;
        }
        categoryMap.set(catData.name, existing.id);
      } else {
        const created = await c.var.prisma.payloadCategory.create({
          data: {
            name: catData.name,
            description: catData.description,
            color: catData.color,
            order: catData.order,
          },
        });
        categoryMap.set(catData.name, created.id);
        results.categoriesCreated++;
      }
    }

    // Import payloads
    for (const payloadData of body.payloads) {
      const categoryId = categoryMap.get(payloadData.categoryName);
      if (!categoryId) {
        results.payloadsSkipped++;
        continue;
      }

      // Check if payload already exists (by name and category)
      const existing = await c.var.prisma.payload.findFirst({
        where: {
          name: payloadData.name,
          categoryId: categoryId,
        },
      });

      if (existing) {
        if (mode === "merge-update") {
          await c.var.prisma.payload.update({
            where: { id: existing.id },
            data: {
              content: payloadData.content,
              description: payloadData.description,
              tags: payloadData.tags,
              isFavorite: payloadData.isFavorite ?? false,
            },
          });
          results.payloadsUpdated++;
        } else {
          results.payloadsSkipped++;
        }
      } else {
        await c.var.prisma.payload.create({
          data: {
            name: payloadData.name,
            content: payloadData.content,
            description: payloadData.description,
            categoryId: categoryId,
            tags: payloadData.tags,
            isFavorite: payloadData.isFavorite ?? false,
          },
        });
        results.payloadsCreated++;
      }
    }

    return c.json({
      message: "Import completed successfully",
      results,
    });
  } catch (error: any) {
    console.error("Import error:", error);
    return c.json({ error: "Import failed" }, 500);
  }
});

// GET /api/payloads/:id - Get single payload
app.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (isNaN(id)) {
    return c.json({ error: "Invalid payload ID" }, 400);
  }

  const payload = await c.var.prisma.payload.findUnique({
    where: { id },
    include: {
      category: true,
      program: true,
    },
  });

  if (!payload) {
    return c.json({ error: "Payload not found" }, 404);
  }

  return c.json(payload);
});

// POST /api/payloads - Create new payload
app.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.name || !body.content || !body.categoryId) {
    return c.json({ error: "Name, content, and categoryId are required" }, 400);
  }

  const payload = await c.var.prisma.payload.create({
    data: {
      name: body.name,
      content: body.content,
      description: body.description || null,
      categoryId: body.categoryId,
      tags: body.tags || null,
      isFavorite: body.isFavorite ?? false,
      programId: body.programId || null,
    },
    include: {
      category: true,
      program: true,
    },
  });

  return c.json(payload, 201);
});

// PUT /api/payloads/:id - Update payload
app.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();

  if (isNaN(id)) {
    return c.json({ error: "Invalid payload ID" }, 400);
  }

  try {
    const payload = await c.var.prisma.payload.update({
      where: { id },
      data: {
        name: body.name,
        content: body.content,
        description: body.description,
        categoryId: body.categoryId,
        tags: body.tags,
        isFavorite: body.isFavorite,
        programId: body.programId,
      },
      include: {
        category: true,
        program: true,
      },
    });

    return c.json(payload);
  } catch (error: any) {
    if (error.code === "P2025") {
      return c.json({ error: "Payload not found" }, 404);
    }
    throw error;
  }
});

// DELETE /api/payloads/:id - Delete payload
app.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (isNaN(id)) {
    return c.json({ error: "Invalid payload ID" }, 400);
  }

  try {
    await c.var.prisma.payload.delete({
      where: { id },
    });

    return c.json({ message: "Payload deleted successfully" });
  } catch (error: any) {
    if (error.code === "P2025") {
      return c.json({ error: "Payload not found" }, 404);
    }
    throw error;
  }
});

// PUT /api/payloads/:id/favorite - Toggle favorite status
app.put("/:id/favorite", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (isNaN(id)) {
    return c.json({ error: "Invalid payload ID" }, 400);
  }

  try {
    // Get current state
    const current = await c.var.prisma.payload.findUnique({
      where: { id },
      select: { isFavorite: true },
    });

    if (!current) {
      return c.json({ error: "Payload not found" }, 404);
    }

    // Toggle favorite
    const payload = await c.var.prisma.payload.update({
      where: { id },
      data: { isFavorite: !current.isFavorite },
      include: {
        category: true,
        program: true,
      },
    });

    return c.json(payload);
  } catch (error: any) {
    if (error.code === "P2025") {
      return c.json({ error: "Payload not found" }, 404);
    }
    throw error;
  }
});

// PUT /api/payloads/:id/program - Link/unlink payload to program
app.put("/:id/program", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();

  if (isNaN(id)) {
    return c.json({ error: "Invalid payload ID" }, 400);
  }

  try {
    const payload = await c.var.prisma.payload.update({
      where: { id },
      data: {
        programId: body.programId || null,
      },
      include: {
        category: true,
        program: true,
      },
    });

    return c.json(payload);
  } catch (error: any) {
    if (error.code === "P2025") {
      return c.json({ error: "Payload not found" }, 404);
    }
    throw error;
  }
});

// POST /api/payloads/bulk-delete - Bulk delete payloads by IDs
app.post("/bulk-delete", async (c) => {
  try {
    const body = await c.req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "ids array is required and must not be empty" }, 400);
    }

    // Convert to integers and validate
    const payloadIds = ids.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));

    if (payloadIds.length === 0) {
      return c.json({ error: "No valid payload IDs provided" }, 400);
    }

    const result = await c.var.prisma.payload.deleteMany({
      where: {
        id: {
          in: payloadIds,
        },
      },
    });

    return c.json({
      message: "Payloads deleted successfully",
      deletedCount: result.count,
    });
  } catch (error: any) {
    console.error("Error bulk deleting payloads:", error);
    return c.json({ error: "Failed to bulk delete payloads" }, 500);
  }
});

export default app;
