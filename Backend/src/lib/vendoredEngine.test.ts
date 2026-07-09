import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Drift guard: the DNS engine is the source of truth here and is vendored, byte
// for byte, into VPS-DNS-Server/ (the VPS deploys independently). If a copy drifts,
// the DNS producer and the correlation-token parser silently disagree — so fail loudly.
const LIB_DIR = import.meta.dir;
const VPS_DIR = join(LIB_DIR, "..", "..", "..", "VPS-DNS-Server");

const VENDORED = [
  "dnsEngine.ts",
  "dnsAnswer.ts",
  "testVectors.json",
  "testVectors.test.ts",
] as const;

describe("vendored engine drift guard", () => {
  for (const file of VENDORED) {
    test(`${file} is byte-identical in Backend and VPS-DNS-Server`, () => {
      const source = readFileSync(join(LIB_DIR, file), "utf8");
      const vendored = readFileSync(join(VPS_DIR, file), "utf8");
      expect(vendored).toBe(source);
    });
  }
});
