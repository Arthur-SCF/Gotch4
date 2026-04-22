import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

interface SeedPayload {
  name: string;
  content: string;
  description: string;
  categoryName: string;
  tags: string;
  isFavorite: boolean;
}

interface SeedCategory {
  name: string;
  description: string;
  color: string;
  order: number;
}

interface SeedData {
  categories: SeedCategory[];
  payloads: SeedPayload[];
}

export async function main() {
  const raw = readFileSync(join(__dir, "data/payloads.json"), "utf-8");
  const data: SeedData = JSON.parse(raw);

  console.log("🌱 Seeding payload library...");
  console.log(`   ${data.categories.length} categories, ${data.payloads.length} payloads\n`);

  // Upsert categories (idempotent — name is @unique)
  const categoryMap: Record<string, number> = {};

  for (const cat of data.categories) {
    const record = await prisma.payloadCategory.upsert({
      where: { name: cat.name },
      update: { description: cat.description, color: cat.color, order: cat.order },
      create: { name: cat.name, description: cat.description, color: cat.color, order: cat.order },
    });
    categoryMap[cat.name] = record.id;
    console.log(`   📁 ${cat.name}`);
  }

  // Create payloads that don't already exist (matched by name + categoryId)
  let created = 0;
  let skipped = 0;

  for (const payload of data.payloads) {
    const categoryId = categoryMap[payload.categoryName];
    if (!categoryId) continue;

    const existing = await prisma.payload.findFirst({
      where: { name: payload.name, categoryId },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.payload.create({
      data: {
        name: payload.name,
        content: payload.content,
        description: payload.description,
        tags: payload.tags,
        isFavorite: payload.isFavorite,
        categoryId,
      },
    });
    created++;
  }

  console.log(`\n✅ Done — ${created} payloads created, ${skipped} already present`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
