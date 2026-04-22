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

// GET /api/payload-categories - List all categories with payload counts
app.get("/", async (c) => {
  const categories = await c.var.prisma.payloadCategory.findMany({
    orderBy: { order: "asc" },
    include: {
      _count: {
        select: { payloads: true },
      },
    },
  });

  return c.json(categories);
});

// GET /api/payload-categories/:id - Get single category with payloads
app.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (isNaN(id)) {
    return c.json({ error: "Invalid category ID" }, 400);
  }

  const category = await c.var.prisma.payloadCategory.findUnique({
    where: { id },
    include: {
      payloads: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!category) {
    return c.json({ error: "Category not found" }, 404);
  }

  return c.json(category);
});

// POST /api/payload-categories - Create new category
app.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.name) {
    return c.json({ error: "Name is required" }, 400);
  }

  try {
    const category = await c.var.prisma.payloadCategory.create({
      data: {
        name: body.name,
        description: body.description || null,
        color: body.color || null,
        order: body.order ?? 0,
      },
    });

    return c.json(category, 201);
  } catch (error: any) {
    if (error.code === "P2002") {
      return c.json({ error: "Category with this name already exists" }, 409);
    }
    throw error;
  }
});

// PUT /api/payload-categories/:id - Update category
app.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();

  if (isNaN(id)) {
    return c.json({ error: "Invalid category ID" }, 400);
  }

  try {
    const category = await c.var.prisma.payloadCategory.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        color: body.color,
        order: body.order,
      },
    });

    return c.json(category);
  } catch (error: any) {
    if (error.code === "P2025") {
      return c.json({ error: "Category not found" }, 404);
    }
    if (error.code === "P2002") {
      return c.json({ error: "Category with this name already exists" }, 409);
    }
    throw error;
  }
});

// DELETE /api/payload-categories/:id - Delete category (cascades to payloads)
app.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (isNaN(id)) {
    return c.json({ error: "Invalid category ID" }, 400);
  }

  try {
    await c.var.prisma.payloadCategory.delete({
      where: { id },
    });

    return c.json({ message: "Category deleted successfully" });
  } catch (error: any) {
    if (error.code === "P2025") {
      return c.json({ error: "Category not found" }, 404);
    }
    throw error;
  }
});

export default app;
