import { Hono } from "hono";
import type { PrismaClient } from "../generated/prisma/client.ts";
import withPrisma from "../lib/prisma.ts";
import { minioClient, MINIO_BUCKET } from "../lib/minio.ts";
import { getMimeType } from "../lib/utils.ts";

// Reserved route prefixes that must not be used as file URL paths.
// Each entry must end with "/" so prefix matching is unambiguous
// (e.g. "/ez/" blocks "/ez/foo" but not "/ezfoo").
const RESERVED_PREFIXES = ["/api/", "/grab/", "/ez/", "/auth/"];

/**
 * Validate a file URL path.
 * Returns an error string if invalid, or null if valid.
 */
function validateUrlPath(urlPath: string): string | null {
  if (!urlPath || typeof urlPath !== "string") return "urlPath is required";
  if (!urlPath.startsWith("/")) return "URL path must start with /";
  if (urlPath.includes("://")) return "URL path must be a relative path, not an absolute URL";
  if (urlPath.includes("@")) return "URL path must not contain @";
  if (urlPath.includes("..")) return "URL path must not contain ..";
  // Whitelist: alphanumeric, slash, dot, dash, underscore only
  if (!/^\/[a-zA-Z0-9._\-/]*$/.test(urlPath)) {
    return "URL path contains invalid characters (allowed: letters, digits, /, ., -, _)";
  }
  // Block reserved application routes — normalise to trailing slash for clean prefix match
  const normalised = urlPath.endsWith("/") ? urlPath : urlPath + "/";
  for (const prefix of RESERVED_PREFIXES) {
    if (normalised.startsWith(prefix)) {
      return `URL path conflicts with reserved application route: ${prefix.slice(0, -1)}`;
    }
  }
  return null;
}

type ContextWithPrisma = {
  Variables: {
    prisma: PrismaClient;
  };
};

const app = new Hono<ContextWithPrisma>();

// Apply prisma middleware to all routes
app.use("/*", withPrisma);

// List all files with pagination
app.get("/", async (c) => {
  try {
    const prisma = c.get("prisma");

    // Parse pagination params — M-03: clamp to prevent full-table scans
    const page  = Math.max(1, parseInt(c.req.query("page")  || "1")  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "50") || 50));
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const total = await prisma.file.count();

    const files = await prisma.file.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: skip,
    });

    return c.json({
      data: files,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch files" }, 500);
  }
});

// Get file metadata
app.get("/:id", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const file = await prisma.file.findUnique({ where: { id } });

    if (!file) {
      return c.json({ error: "File not found" }, 404);
    }

    return c.json(file);
  } catch (error) {
    return c.json({ error: "Failed to fetch file" }, 500);
  }
});

// Get file content
app.get("/:id/content", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const file = await prisma.file.findUnique({ where: { id } });

    if (!file) {
      return c.json({ error: "File not found" }, 404);
    }

    // Get object from MinIO
    const stream = await minioClient.getObject(MINIO_BUCKET, file.path);

    // Convert stream to string
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString("utf-8");

    return c.json({ filename: file.filename, content });
  } catch (error) {
    console.error("Error reading file content:", error);
    return c.json({ error: "Failed to read file content" }, 500);
  }
});

// Create new file
app.post("/", async (c) => {
  try {
    const prisma = c.get("prisma");
    const body = await c.req.json();
    const { filename, content, urlPath, mimetype: mimetypeOverride } = body;

    if (!filename || content === undefined) {
      return c.json({ error: "Filename and content are required" }, 400);
    }

    // Default urlPath if not provided
    const finalUrlPath = urlPath || `/files/${filename}`;

    // Validate urlPath
    const pathError = validateUrlPath(finalUrlPath);
    if (pathError) {
      return c.json({ error: pathError }, 400);
    }

    // Check if filename or urlPath already exists
    const existingFilename = await prisma.file.findUnique({
      where: { filename },
    });
    if (existingFilename) {
      return c.json({ error: "File with this name already exists" }, 409);
    }

    const existingUrlPath = await prisma.file.findUnique({
      where: { urlPath: finalUrlPath },
    });
    if (existingUrlPath) {
      return c.json({ error: "File with this URL path already exists" }, 409);
    }

    const mimetype = (mimetypeOverride && typeof mimetypeOverride === "string" && mimetypeOverride.trim())
      ? mimetypeOverride.trim()
      : getMimeType(filename);

    // Convert content to buffer
    const buffer = Buffer.from(content, "utf-8");
    const size = buffer.length;

    // Upload to MinIO
    await minioClient.putObject(MINIO_BUCKET, filename, buffer, size, {
      "Content-Type": mimetype,
    });

    // Save metadata to database (path stores MinIO object key)
    const file = await prisma.file.create({
      data: {
        filename,
        urlPath: finalUrlPath,
        mimetype,
        size,
        path: filename, // Store MinIO object key
      },
    });

    return c.json(file, 201);
  } catch (error) {
    console.error("Error creating file:", error);
    return c.json({ error: "Failed to create file" }, 500);
  }
});

// Update file
app.put("/:id", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { content, urlPath, mimetype: mimetypeOverride } = body;

    if (content === undefined && urlPath === undefined && mimetypeOverride === undefined) {
      return c.json({ error: "Content, urlPath, or mimetype is required" }, 400);
    }

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) {
      return c.json({ error: "File not found" }, 404);
    }

    // Validate and check new urlPath
    if (urlPath && urlPath !== file.urlPath) {
      const pathError = validateUrlPath(urlPath);
      if (pathError) {
        return c.json({ error: pathError }, 400);
      }

      const existingUrlPath = await prisma.file.findUnique({
        where: { urlPath },
      });
      if (existingUrlPath) {
        return c.json({ error: "File with this URL path already exists" }, 409);
      }
    }

    // Prepare update data
    const updateData: any = {};

    // Resolve new mimetype if provided
    const newMimetype = (mimetypeOverride && typeof mimetypeOverride === "string" && mimetypeOverride.trim())
      ? mimetypeOverride.trim()
      : undefined;

    // Update content in MinIO if provided
    if (content !== undefined) {
      const buffer = Buffer.from(content, "utf-8");
      const size = buffer.length;

      await minioClient.putObject(MINIO_BUCKET, file.path, buffer, size, {
        "Content-Type": newMimetype ?? file.mimetype,
      });

      updateData.size = size;
    } else if (newMimetype) {
      // Mimetype changed but content not re-uploaded; re-put with new Content-Type header
      const stream = await minioClient.getObject(MINIO_BUCKET, file.path);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      await minioClient.putObject(MINIO_BUCKET, file.path, buffer, buffer.length, {
        "Content-Type": newMimetype,
      });
    }

    // Update mimetype if provided
    if (newMimetype) {
      updateData.mimetype = newMimetype;
    }

    // Update urlPath if provided
    if (urlPath) {
      updateData.urlPath = urlPath;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: updateData,
    });

    return c.json(updated);
  } catch (error) {
    console.error("Error updating file:", error);
    return c.json({ error: "Failed to update file" }, 500);
  }
});

// Toggle file detection (detectHit flag)
app.put("/:id/detect", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { detectHit } = body;

    if (typeof detectHit !== "boolean") {
      return c.json({ error: "detectHit must be a boolean" }, 400);
    }

    const file = await prisma.file.update({
      where: { id },
      data: { detectHit },
    });

    return c.json(file);
  } catch (error) {
    console.error("Error updating file detection:", error);
    return c.json({ error: "Failed to update file detection" }, 500);
  }
});

// Delete file
app.delete("/:id", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const file = await prisma.file.findUnique({ where: { id } });

    if (!file) {
      return c.json({ error: "File not found" }, 404);
    }

    // H-07: Delete DB record first — orphaned MinIO objects are preferable to orphaned DB records
    await prisma.file.delete({ where: { id } });

    // Then clean up MinIO — failure here is non-fatal
    try {
      await minioClient.removeObject(MINIO_BUCKET, file.path);
    } catch (e) {
      console.warn("[Files] MinIO cleanup failed for", file.path, e);
    }

    return c.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting file:", error);
    return c.json({ error: "Failed to delete file" }, 500);
  }
});

// Link file to program
app.put("/:id/program", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { programId } = body;

    const file = await prisma.file.update({
      where: { id },
      data: { programId: programId || null },
    });

    return c.json(file);
  } catch (error) {
    console.error("Error linking file to program:", error);
    return c.json({ error: "Failed to link file to program" }, 500);
  }
});

// Update file notes
app.put("/:id/notes", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { notes } = body;

    const file = await prisma.file.update({
      where: { id },
      data: { notes: notes || null },
    });

    return c.json(file);
  } catch (error) {
    console.error("Error updating file notes:", error);
    return c.json({ error: "Failed to update file notes" }, 500);
  }
});

// Update file public/private status
app.put("/:id/visibility", async (c) => {
  try {
    const prisma = c.get("prisma");
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { isPublic } = body;

    if (typeof isPublic !== "boolean") {
      return c.json({ error: "isPublic must be a boolean" }, 400);
    }

    const file = await prisma.file.update({
      where: { id },
      data: { isPublic },
    });

    return c.json(file);
  } catch (error) {
    console.error("Error updating file visibility:", error);
    return c.json({ error: "Failed to update file visibility" }, 500);
  }
});

// Bulk download files as ZIP
app.post("/download", async (c) => {
  try {
    const prisma = c.get("prisma");
    const body = await c.req.json();
    const { fileIds } = body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return c.json({ error: "fileIds array is required" }, 400);
    }

    const files = await prisma.file.findMany({
      where: {
        id: {
          in: fileIds.map((id) => parseInt(id)),
        },
      },
    });

    if (files.length === 0) {
      return c.json({ error: "No files found" }, 404);
    }

    // For now, return file metadata - ZIP creation will be handled client-side
    // or we can implement server-side ZIP using archiver library later
    return c.json({ files, count: files.length });
  } catch (error) {
    console.error("Error preparing bulk download:", error);
    return c.json({ error: "Failed to prepare bulk download" }, 500);
  }
});

// Bulk delete files by IDs
app.post("/bulk-delete", async (c) => {
  try {
    const prisma = c.get("prisma");
    const body = await c.req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "ids array is required and must not be empty" }, 400);
    }

    // Convert to integers and validate
    const fileIds = ids.map((id) => parseInt(id)).filter((id) => !isNaN(id));

    if (fileIds.length === 0) {
      return c.json({ error: "No valid file IDs provided" }, 400);
    }

    // Get files to delete from MinIO
    const files = await prisma.file.findMany({
      where: {
        id: {
          in: fileIds,
        },
      },
    });

    // Delete files from MinIO
    const deletePromises = files.map((file) =>
      minioClient.removeObject(MINIO_BUCKET, file.path).catch((err) => {
        console.error(`Failed to delete ${file.path} from MinIO:`, err);
        // Continue even if MinIO deletion fails
      })
    );
    await Promise.allSettled(deletePromises);

    // Delete from database
    const result = await prisma.file.deleteMany({
      where: {
        id: {
          in: fileIds,
        },
      },
    });

    return c.json({
      message: "Files deleted successfully",
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("Error bulk deleting files:", error);
    return c.json({ error: "Failed to bulk delete files" }, 500);
  }
});

export default app;
