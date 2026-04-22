/**
 * In-memory cache of programs that have a scope defined.
 * Avoids a DB round-trip on every incoming capture.
 * Invalidated whenever a program is created, updated, or deleted.
 */

import { prisma } from "./prisma.ts";

export interface CachedProgram {
  id: number;
  name: string;
  scope: string;
}

let cache: CachedProgram[] | null = null;

export async function getProgramsWithScope(): Promise<CachedProgram[]> {
  if (cache !== null) return cache;

  const rows = await prisma.program.findMany({
    where: { scope: { not: null } },
    select: { id: true, name: true, scope: true },
  });

  cache = rows
    .filter((r): r is typeof r & { scope: string } => r.scope !== null && r.scope.trim() !== "")
    .map((r) => ({ id: r.id, name: r.name, scope: r.scope }));

  return cache;
}

export function invalidateScopeCache(): void {
  cache = null;
}
