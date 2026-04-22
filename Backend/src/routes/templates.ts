import { Hono } from "hono";
import { readFile } from "fs/promises";
import { join } from "path";
import { TEMPLATE_METADATA, type TemplateCategory } from "../templates/metadata.ts";

const app = new Hono();

// Get all templates with their content
app.get("/", async (c) => {
  try {
    const templatesDir = join(process.cwd(), "src", "templates");

    // Load content for each template
    const categoriesWithContent: TemplateCategory[] = await Promise.all(
      TEMPLATE_METADATA.map(async (category) => {
        const templatesWithContent = await Promise.all(
          category.templates.map(async (template) => {
            const filePath = join(templatesDir, template.filePath);
            const content = await readFile(filePath, "utf-8");

            return {
              ...template,
              content,
            };
          })
        );

        return {
          ...category,
          templates: templatesWithContent,
        };
      })
    );

    return c.json({ categories: categoriesWithContent });
  } catch (error) {
    console.error("Error loading templates:", error);
    return c.json({ error: "Failed to load templates" }, 500);
  }
});

// Get single template by ID
app.get("/:id", async (c) => {
  try {
    const templateId = c.req.param("id");
    const templatesDir = join(process.cwd(), "src", "templates");

    // Find template in metadata
    let foundTemplate = null;
    for (const category of TEMPLATE_METADATA) {
      const template = category.templates.find((t) => t.id === templateId);
      if (template) {
        foundTemplate = template;
        break;
      }
    }

    if (!foundTemplate) {
      return c.json({ error: "Template not found" }, 404);
    }

    // Load content
    const filePath = join(templatesDir, foundTemplate.filePath);
    const content = await readFile(filePath, "utf-8");

    return c.json({
      ...foundTemplate,
      content,
    });
  } catch (error) {
    console.error("Error loading template:", error);
    return c.json({ error: "Failed to load template" }, 500);
  }
});

export default app;
