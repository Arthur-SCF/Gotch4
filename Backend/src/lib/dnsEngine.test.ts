import { describe, expect, test } from "bun:test";
import {
  GRAMMAR_VERSION,
  extractCorrelationToken,
  hexDwordToIpv4,
  ipv4ToHexDword,
  mintToken,
  parseInteractionName,
} from "./dnsEngine.ts";

const BASE = "collab.example.com";

describe("mintToken", () => {
  test("Given no input, When minting, Then returns a 16-char lowercase base32 token", () => {
    const token = mintToken();
    expect(token).toMatch(/^[a-z2-7]{16}$/);
  });

  test("Given repeated mints, When compared, Then tokens differ (entropy)", () => {
    const a = mintToken();
    const b = mintToken();
    expect(a).not.toBe(b);
  });

  test("Given 500 mints, When inspected, Then none start with reserved rb/ip prefixes", () => {
    for (let i = 0; i < 500; i++) {
      const token = mintToken();
      expect(token.startsWith("rb")).toBe(false);
      expect(token.startsWith("ip")).toBe(false);
    }
  });
});

describe("hex <-> ipv4 roundtrip", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["127.0.0.1", "7f000001"],
    ["0.0.0.0", "00000000"],
    ["255.255.255.255", "ffffffff"],
    ["192.168.0.1", "c0a80001"],
    ["169.254.169.254", "a9fea9fe"],
    ["100.100.100.200", "646464c8"],
  ];

  for (const [ip, hex] of cases) {
    test(`Given ${ip}, When encoded, Then hex dword is ${hex}`, () => {
      expect(ipv4ToHexDword(ip)).toBe(hex);
    });
    test(`Given ${hex}, When decoded, Then ipv4 is ${ip}`, () => {
      expect(hexDwordToIpv4(hex)).toBe(ip);
    });
  }
});

describe("parseInteractionName — not under base", () => {
  test("Given an unrelated domain, Then kind is none", () => {
    expect(parseInteractionName("evil.com", BASE)).toEqual({ kind: "none" });
  });

  test("Given the base domain itself, Then kind is none (not a subdomain)", () => {
    expect(parseInteractionName(BASE, BASE)).toEqual({ kind: "none" });
  });

  test("Given a sibling that only suffix-matches, Then kind is none (suffix-bug guard)", () => {
    // "notcollab.example.com" must NOT be treated as under "collab.example.com"
    expect(parseInteractionName("notcollab.example.com", BASE)).toEqual({
      kind: "none",
    });
  });
});

describe("parseInteractionName — capture", () => {
  test("Given <token>.base, Then kind is capture with that token", () => {
    expect(parseInteractionName("abc234.collab.example.com", BASE)).toEqual({
      kind: "capture",
      token: "abc234",
    });
  });

  test("Given prepended labels x.y.<token>.base, Then token is the label adjacent to base", () => {
    expect(parseInteractionName("x.y.mytoken.collab.example.com", BASE)).toEqual(
      { kind: "capture", token: "mytoken" },
    );
  });

  test("Given 0x20 case-randomized name, Then it is lowercased", () => {
    expect(parseInteractionName("ABC234.Collab.Example.COM", BASE)).toEqual({
      kind: "capture",
      token: "abc234",
    });
  });

  test("Given a trailing dot (FQDN root), Then it is stripped", () => {
    expect(parseInteractionName("abc234.collab.example.com.", BASE)).toEqual({
      kind: "capture",
      token: "abc234",
    });
  });
});

describe("parseInteractionName — rebind", () => {
  test("Given a well-formed rebind label, Then all fields decode", () => {
    const name = "rb-7f000001-c0a80001-rd-deadbeef-mytoken.collab.example.com";
    expect(parseInteractionName(name, BASE)).toEqual({
      kind: "rebind",
      ipA: "127.0.0.1",
      ipB: "192.168.0.1",
      strategy: "rd",
      mac: "deadbeef",
      token: "mytoken",
    });
  });

  test("Given each strategy code, Then it parses", () => {
    for (const s of ["fs", "ma", "rr", "rd"] as const) {
      const name = `rb-7f000001-00000000-${s}-abcd-tok.collab.example.com`;
      const parsed = parseInteractionName(name, BASE);
      expect(parsed).toMatchObject({ kind: "rebind", strategy: s });
    }
  });

  test("Given a malformed rebind label, Then it falls back to capture", () => {
    // missing fields -> not a valid rebind grammar -> treat whole label as capture token
    const name = "rb-7f000001-nope.collab.example.com";
    expect(parseInteractionName(name, BASE)).toEqual({
      kind: "capture",
      token: "rb-7f000001-nope",
    });
  });
});

describe("parseInteractionName — embed (single IP)", () => {
  test("Given ip-<hex>-<mac>-<token>.base, Then it decodes the embedded IP", () => {
    const name = "ip-a9fea9fe-abcd-tok.collab.example.com";
    expect(parseInteractionName(name, BASE)).toEqual({
      kind: "embed",
      ip: "169.254.169.254",
      mac: "abcd",
      token: "tok",
    });
  });
});

describe("extractCorrelationToken", () => {
  test("Given a capture name, Then returns the token", () => {
    expect(extractCorrelationToken("tok234.collab.example.com", BASE)).toBe(
      "tok234",
    );
  });

  test("Given a rebind name, Then returns the embedded token", () => {
    expect(
      extractCorrelationToken(
        "rb-7f000001-c0a80001-fs-abcd-rbtok.collab.example.com",
        BASE,
      ),
    ).toBe("rbtok");
  });

  test("Given a name not under base, Then returns null", () => {
    expect(extractCorrelationToken("evil.com", BASE)).toBeNull();
  });
});

test("GRAMMAR_VERSION is a positive integer (drift stamp)", () => {
  expect(Number.isInteger(GRAMMAR_VERSION)).toBe(true);
  expect(GRAMMAR_VERSION).toBeGreaterThan(0);
});
