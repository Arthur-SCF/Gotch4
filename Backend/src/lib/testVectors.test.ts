import { describe, expect, test } from "bun:test";
import vectors from "./testVectors.json";
import {
  hexDwordToIpv4,
  ipv4ToHexDword,
  isRebindStrategy,
  parseInteractionName,
} from "./dnsEngine.ts";
import {
  buildEmbedLabel,
  buildRebindLabel,
  verifyInteractionMac,
} from "./dnsAnswer.ts";

// These vectors are the canonical wire-format contract. The VPS runs a vendored
// copy of this file against its vendored engine, so identical results here and
// there prove the two engine copies have not drifted.
const { secret, baseDomain } = vectors;

describe("testVectors — hex <-> ipv4", () => {
  for (const v of vectors.hex) {
    test(`${v.ip} <-> ${v.hex}`, () => {
      expect(ipv4ToHexDword(v.ip)).toBe(v.hex);
      expect(hexDwordToIpv4(v.hex)).toBe(v.ip);
    });
  }
});

describe("testVectors — capture", () => {
  for (const v of vectors.capture) {
    test(v.fqdn, () => {
      expect(parseInteractionName(v.fqdn, baseDomain)).toEqual({
        kind: "capture",
        token: v.token,
      });
    });
  }
});

describe("testVectors — rebind wire format", () => {
  for (const v of vectors.rebind) {
    test(v.label, () => {
      const strategy = v.strategy;
      if (!isRebindStrategy(strategy)) {
        throw new Error(`invalid strategy in vector: ${strategy}`);
      }
      expect(buildRebindLabel(v.ipA, v.ipB, strategy, v.token, secret)).toBe(v.label);
      const parsed = parseInteractionName(`${v.label}.${baseDomain}`, baseDomain);
      expect(parsed).toEqual({
        kind: "rebind",
        ipA: v.ipA,
        ipB: v.ipB,
        strategy,
        mac: v.mac,
        token: v.token,
      });
      expect(verifyInteractionMac(parsed, secret)).toBe(true);
    });
  }
});

describe("testVectors — embed wire format", () => {
  for (const v of vectors.embed) {
    test(v.label, () => {
      expect(buildEmbedLabel(v.ip, v.token, secret)).toBe(v.label);
      const parsed = parseInteractionName(`${v.label}.${baseDomain}`, baseDomain);
      expect(parsed).toEqual({
        kind: "embed",
        ip: v.ip,
        mac: v.mac,
        token: v.token,
      });
      expect(verifyInteractionMac(parsed, secret)).toBe(true);
    });
  }
});
