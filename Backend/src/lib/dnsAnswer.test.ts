import { describe, expect, test } from "bun:test";
import { parseInteractionName } from "./dnsEngine.ts";
import {
  buildEmbedLabel,
  buildRebindLabel,
  computeMac,
  MAC_LENGTH,
  planAnswer,
  type RebindContext,
  resetRebindState,
  resolveRebindIps,
  verifyInteractionMac,
} from "./dnsAnswer.ts";

const BASE = "collab.example.com";
const SECRET = "unit-test-secret-abcdefghijklmnop";
const DEFAULT_IP = "203.0.113.9";
const TXT = "gotch4";

function plan(fqdn: string, qtype: string, secret = SECRET) {
  return planAnswer({
    fqdn,
    qtype,
    baseDomain: BASE,
    defaultIp: DEFAULT_IP,
    secret,
    txtValue: TXT,
  });
}

describe("computeMac", () => {
  test("Given a message, When hashed twice, Then it is deterministic and MAC_LENGTH hex", () => {
    const a = computeMac("rb:7f000001:c0a80001:rd", SECRET);
    const b = computeMac("rb:7f000001:c0a80001:rd", SECRET);
    expect(a).toBe(b);
    expect(a).toMatch(new RegExp(`^[0-9a-f]{${MAC_LENGTH}}$`));
  });

  test("Given a different secret, Then the MAC differs", () => {
    expect(computeMac("rb:7f000001:c0a80001:rd", SECRET)).not.toBe(
      computeMac("rb:7f000001:c0a80001:rd", "other-secret-000000000000000000"),
    );
  });
});

describe("verifyInteractionMac roundtrip", () => {
  test("Given a rebind label built with the secret, Then it parses and verifies", () => {
    const label = buildRebindLabel("127.0.0.1", "192.168.0.1", "ma", "tok234", SECRET);
    const parsed = parseInteractionName(`${label}.${BASE}`, BASE);
    expect(parsed.kind).toBe("rebind");
    expect(verifyInteractionMac(parsed, SECRET)).toBe(true);
  });

  test("Given the wrong secret, Then verification fails", () => {
    const label = buildRebindLabel("127.0.0.1", "192.168.0.1", "rd", "tok234", SECRET);
    const parsed = parseInteractionName(`${label}.${BASE}`, BASE);
    expect(verifyInteractionMac(parsed, "wrong-secret-0000000000000000000")).toBe(false);
  });

  test("Given a tampered target IP, Then verification fails", () => {
    const label = buildRebindLabel("127.0.0.1", "192.168.0.1", "rd", "tok234", SECRET);
    const tampered = label.replace("c0a80001", "0a000001"); // 192.168.0.1 -> 10.0.0.1
    const parsed = parseInteractionName(`${tampered}.${BASE}`, BASE);
    expect(verifyInteractionMac(parsed, SECRET)).toBe(false);
  });

  test("Given an embed label, Then it parses and verifies", () => {
    const label = buildEmbedLabel("169.254.169.254", "tok234", SECRET);
    const parsed = parseInteractionName(`${label}.${BASE}`, BASE);
    expect(parsed.kind).toBe("embed");
    expect(verifyInteractionMac(parsed, SECRET)).toBe(true);
  });
});

function ctx(
  strategy: RebindContext["strategy"],
  token: string,
  resolverIp = "9.9.9.9",
): RebindContext {
  return { strategy, ipA: "1.1.1.1", ipB: "2.2.2.2", token, qtype: "A", resolverIp };
}

describe("resolveRebindIps", () => {
  test("Given ma, Then both IPs are returned in order", () => {
    expect(resolveRebindIps(ctx("ma", "t1"))).toEqual(["1.1.1.1", "2.2.2.2"]);
  });

  test("Given rd, Then exactly one of the two IPs is returned", () => {
    for (let i = 0; i < 50; i++) {
      const ips = resolveRebindIps(ctx("rd", "t2"));
      expect(ips).toHaveLength(1);
      expect(["1.1.1.1", "2.2.2.2"]).toContain(ips[0]);
    }
  });

  test("Given fs, Then benign ipA is served first, then target ipB", () => {
    resetRebindState();
    // distinct resolvers dodge the dedup window so the counter advances each call
    expect(resolveRebindIps(ctx("fs", "fstok", "1.0.0.1"))).toEqual(["1.1.1.1"]);
    expect(resolveRebindIps(ctx("fs", "fstok", "1.0.0.2"))).toEqual(["2.2.2.2"]);
    expect(resolveRebindIps(ctx("fs", "fstok", "1.0.0.3"))).toEqual(["2.2.2.2"]);
  });

  test("Given rr, Then answers alternate ipA/ipB", () => {
    resetRebindState();
    expect(resolveRebindIps(ctx("rr", "rrtok", "1.0.0.1"))).toEqual(["1.1.1.1"]);
    expect(resolveRebindIps(ctx("rr", "rrtok", "1.0.0.2"))).toEqual(["2.2.2.2"]);
    expect(resolveRebindIps(ctx("rr", "rrtok", "1.0.0.3"))).toEqual(["1.1.1.1"]);
    expect(resolveRebindIps(ctx("rr", "rrtok", "1.0.0.4"))).toEqual(["2.2.2.2"]);
  });

  test("Given a rapid identical query, Then in-flight dedup keeps the counter still", () => {
    resetRebindState();
    const first = resolveRebindIps(ctx("fs", "deduptok", "5.5.5.5"));
    const second = resolveRebindIps(ctx("fs", "deduptok", "5.5.5.5"));
    expect(first).toEqual(["1.1.1.1"]);
    expect(second).toEqual(["1.1.1.1"]);
  });
});

describe("planAnswer — capture", () => {
  test("Given a name not under base, Then NXDOMAIN", () => {
    expect(plan("evil.com", "A").plan).toEqual({ kind: "nxdomain" });
  });

  test("Given capture A, Then the default (VPS) IP is returned", () => {
    const r = plan("cap234.collab.example.com", "A");
    expect(r.plan).toEqual({ kind: "records", records: [{ type: "A", ip: DEFAULT_IP }] });
    expect(r.token).toBe("cap234");
    expect(r.strategy).toBeNull();
  });

  test("Given capture TXT, Then the TXT value is returned", () => {
    expect(plan("cap234.collab.example.com", "TXT").plan).toEqual({
      kind: "records",
      records: [{ type: "TXT", text: TXT }],
    });
  });

  test("Given capture AAAA, Then NODATA (no ::1 footgun)", () => {
    expect(plan("cap234.collab.example.com", "AAAA").plan).toEqual({ kind: "nodata" });
  });
});

describe("planAnswer — rebind", () => {
  function rebindFqdn(strategy: "ma" | "rd", token = "rbtok") {
    return `${buildRebindLabel("35.185.206.165", "127.0.0.1", strategy, token, SECRET)}.${BASE}`;
  }

  test("Given rebind ma A, Then both IPs are returned in one answer", () => {
    const r = plan(rebindFqdn("ma"), "A");
    expect(r.plan).toEqual({
      kind: "records",
      records: [
        { type: "A", ip: "35.185.206.165" },
        { type: "A", ip: "127.0.0.1" },
      ],
    });
    expect(r.strategy).toBe("ma");
    expect(r.token).toBe("rbtok");
  });

  test("Given rebind rd A, Then one authorized IP is returned", () => {
    const r = plan(rebindFqdn("rd"), "A");
    expect(r.plan.kind).toBe("records");
    expect(r.strategy).toBe("rd");
  });

  test("Given rebind AAAA, Then NODATA (Happy-Eyeballs guard)", () => {
    expect(plan(rebindFqdn("ma"), "AAAA").plan).toEqual({ kind: "nodata" });
  });

  test("Given rebind with an invalid MAC, Then it falls back to a benign capture answer", () => {
    const r = plan(rebindFqdn("ma"), "A", "attacker-supplied-secret-00000000");
    expect(r.plan).toEqual({ kind: "records", records: [{ type: "A", ip: DEFAULT_IP }] });
    expect(r.strategy).toBeNull();
  });
});

describe("planAnswer — embed", () => {
  test("Given a valid embed A, Then the embedded IP is returned", () => {
    const fqdn = `${buildEmbedLabel("169.254.169.254", "emtok", SECRET)}.${BASE}`;
    expect(plan(fqdn, "A").plan).toEqual({
      kind: "records",
      records: [{ type: "A", ip: "169.254.169.254" }],
    });
  });
});
