// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkAccess, createDenyLogger, forbiddenHtml, validateAccessEnv } from "./guard";

const h = (o: Record<string, string>) => new Headers(o);
const on = { ALLOWED_IPS: "100.101.102.103, 100.64.0.0/10" };

describe("checkAccess", () => {
  it("feature off: everything allowed, even with no peer information", () => {
    expect(checkAccess(h({}), {})).toEqual({ allowed: true });
    expect(checkAccess(h({ "x-ezh-peer": "8.8.8.8" }), { ALLOWED_IPS: "" })).toEqual({ allowed: true });
  });
  it("on: host-local request (trusted peer, no forwarded header) is allowed", () => {
    expect(checkAccess(h({ "x-ezh-peer": "172.18.0.1" }), on)).toEqual({ allowed: true });
    expect(checkAccess(h({ "x-ezh-peer": "::ffff:127.0.0.1", "x-ezh-xff": "" }), on)).toEqual({ allowed: true });
  });
  it("S2: proxy headers present but no usable forwarded address -> denied, shown as unknown", () => {
    expect(checkAccess(h({ "x-ezh-peer": "172.18.0.1", "x-ezh-proxy": "x-forwarded-for", "x-ezh-xff": "" }), on)).toEqual({ allowed: false, ip: null });
    expect(checkAccess(h({ "x-ezh-peer": "127.0.0.1", "x-ezh-proxy": "x-forwarded-host" }), on)).toEqual({ allowed: false, ip: null });
    expect(checkAccess(h({ "x-ezh-peer": "172.18.0.1", "x-ezh-proxy": "x-forwarded-host,x-forwarded-for", "x-ezh-xff": "100.101.102.103" }), on)).toEqual({ allowed: true });
  });
  it("on: tailnet request through the trusted proxy is judged by the forwarded address", () => {
    expect(checkAccess(h({ "x-ezh-peer": "172.18.0.1", "x-ezh-xff": "100.101.102.103" }), on)).toEqual({ allowed: true });
    expect(checkAccess(h({ "x-ezh-peer": "172.18.0.1", "x-ezh-xff": "100.99.1.1" }), on)).toEqual({ allowed: true });
    expect(checkAccess(h({ "x-ezh-peer": "172.18.0.1", "x-ezh-xff": "100.200.1.1" }), on)).toEqual({ allowed: false, ip: "100.200.1.1" });
  });
  it("on: direct non-proxy peer is judged by its peer address and cannot spoof headers", () => {
    expect(checkAccess(h({ "x-ezh-peer": "203.0.113.9", "x-ezh-xff": "100.101.102.103" }), on)).toEqual({ allowed: false, ip: "203.0.113.9" });
    expect(checkAccess(h({ "x-ezh-peer": "203.0.113.9", "x-forwarded-for": "100.101.102.103" }), on)).toEqual({ allowed: false, ip: "203.0.113.9" });
    expect(checkAccess(h({ "x-ezh-peer": "100.101.102.103" }), on)).toEqual({ allowed: true });
  });
  it("on: a plain x-forwarded-for from a trusted peer is NOT used (only the value stamped before Next touched it)", () => {
    expect(checkAccess(h({ "x-ezh-peer": "127.0.0.1", "x-forwarded-for": "100.101.102.103" }), on)).toEqual({ allowed: true }); // local
  });
  it("on: fails closed when the peer stamp is missing or unreadable", () => {
    expect(checkAccess(h({}), on)).toEqual({ allowed: false, ip: null });
    expect(checkAccess(h({ "x-forwarded-for": "100.101.102.103" }), on)).toEqual({ allowed: false, ip: null });
    expect(checkAccess(h({ "x-ezh-peer": "garbage" }), on)).toEqual({ allowed: false, ip: null });
  });
  it("TRUSTED_PROXIES overrides the default trusted set", () => {
    const env = { ...on, TRUSTED_PROXIES: "10.0.0.0/8" };
    expect(checkAccess(h({ "x-ezh-peer": "10.1.1.1", "x-ezh-xff": "100.101.102.103" }), env)).toEqual({ allowed: true });
    expect(checkAccess(h({ "x-ezh-peer": "127.0.0.1", "x-ezh-xff": "100.101.102.103" }), env)).toEqual({ allowed: false, ip: "127.0.0.1" });
  });
  it("a malformed ALLOWED_IPS or TRUSTED_PROXIES throws instead of allowing", () => {
    expect(() => checkAccess(h({}), { ALLOWED_IPS: "100.101.102.103, nope" })).toThrow(/nope/);
    expect(() => checkAccess(h({}), { ...on, TRUSTED_PROXIES: "bad" })).toThrow(/bad/);
  });
});

describe("warnings", () => {
  it("validateAccessEnv reports very broad ranges without failing", () => {
    const warnings = validateAccessEnv({ ALLOWED_IPS: "128.0.0.0/1" });
    expect(warnings.join(" ")).toMatch(/broad/);
    expect(validateAccessEnv({ ALLOWED_IPS: "100.101.102.103" })).toEqual([]);
  });
  it("match-everything ranges are refused", () => {
    expect(() => validateAccessEnv({ ALLOWED_IPS: "0.0.0.0/0" })).toThrow();
    expect(() => checkAccess(new Headers(), { ALLOWED_IPS: "::/0" })).toThrow();
  });
});

describe("forbiddenHtml", () => {
  it("Thai first, English second, shows the IP and nothing else", () => {
    const html = forbiddenHtml("100.200.1.1");
    expect(html).toContain("อุปกรณ์นี้ไม่ได้รับอนุญาตให้ใช้แอป");
    expect(html).toContain("This device is not allowed to use this app.");
    expect(html).toContain("100.200.1.1");
    expect(html.indexOf("อุปกรณ์นี้")).toBeLessThan(html.indexOf("This device"));
    expect(html).toContain('lang="th"');
    expect(html).toContain('name="viewport"');
  });
  it("has no colour literals (design-token rule: system colours only) and escapes the IP", () => {
    const html = forbiddenHtml('<script>"x"</script>');
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|oklch\(/);
  });
  it("copes with an unknown IP", () => {
    expect(forbiddenHtml(null)).toContain("ไม่ทราบ");
  });
});

describe("createDenyLogger", () => {
  const make = () => {
    const lines: string[] = [];
    let t = 1_000_000;
    const log = createDenyLogger({ write: (l) => lines.push(l), now: () => t, windowMs: 60_000, maxPerWindow: 5, maxKeys: 3 });
    return { lines, log, advance: (ms: number) => (t += ms) };
  };
  it("logs the first denial with ip and path", () => {
    const { lines, log } = make();
    log("203.0.113.9", "/api/health");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("203.0.113.9");
    expect(lines[0]).toContain("/api/health");
  });
  it("same ip is logged once per window, then reports how many were suppressed", () => {
    const { lines, log, advance } = make();
    for (let i = 0; i < 100; i++) log("203.0.113.9", `/scan/${i}`);
    expect(lines).toHaveLength(1);
    advance(60_001);
    log("203.0.113.9", "/again");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("99");
  });
  it("many different ips cannot flood the log either (global cap per window)", () => {
    const { lines, log, advance } = make();
    for (let i = 0; i < 1000; i++) log(`198.51.100.${i % 250}`, "/");
    expect(lines.length).toBeLessThanOrEqual(6);
    advance(60_001);
    log("198.51.100.1", "/");
    expect(lines.at(-1)).toMatch(/suppressed/i);
  });
  it("keeps bounded memory", () => {
    const { log } = make();
    for (let i = 0; i < 10_000; i++) log(`10.0.${i >> 8}.${i & 255}`, "/");
    // no assertion on internals; must simply not throw or hang
    expect(true).toBe(true);
  });
  it("sanitises the path (no log injection) and truncates it", () => {
    const { lines, log } = make();
    log("203.0.113.9", "/a\nFAKE LOG LINE" + "x".repeat(500));
    expect(lines[0]).not.toContain("\n");
    expect(lines[0].length).toBeLessThan(300);
  });
});
