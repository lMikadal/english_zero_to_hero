// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AllowListError, createAllowList, parseIp, stripPort } from "./allowlist";

describe("parseIp", () => {
  it("accepts plain IPv4", () => {
    expect(parseIp("100.101.102.103")).toEqual({ version: 4, value: 0x64656667n });
    expect(parseIp("0.0.0.0")?.value).toBe(0n);
    expect(parseIp("255.255.255.255")?.value).toBe(0xffffffffn);
  });
  it.each(["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1.2.3.-4", "01.2.3.4", "1.2.3.04", "a.b.c.d", "1.2.3.4 ", " 1.2.3.4", "1..3.4", "0x7f.0.0.1", "1.2.3.4/8", "١.٢.٣.٤"])("rejects malformed IPv4 %j", (s) => {
    expect(parseIp(s)).toBeNull();
  });
  it("accepts IPv6 in full, compressed and embedded-IPv4 forms", () => {
    expect(parseIp("::1")).toEqual({ version: 6, value: 1n });
    expect(parseIp("::")).toEqual({ version: 6, value: 0n });
    expect(parseIp("fd7a:115c:a1e0::1")?.value).toBe(0xfd7a115ca1e0n * 2n ** 80n + 1n);
    expect(parseIp("FD7A:115C:A1E0:0:0:0:0:1")).toEqual(parseIp("fd7a:115c:a1e0::1"));
    expect(parseIp("2001:db8::1.2.3.4")?.value).toBe(0x20010db8n * 2n ** 96n + 0x01020304n);
  });
  it.each(["", ":", ":::", "1::2::3", "12345::1", "g::1", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "::1.2.3", "::1.2.3.256", "1:2:3:4:5:6:7::8", "[::1]", "::1/128", "fe80::1%"])("rejects malformed IPv6 %j", (s) => {
    expect(parseIp(s)).toBeNull();
  });
  it("drops a zone id", () => {
    expect(parseIp("fe80::1%eth0")).toEqual(parseIp("fe80::1"));
  });
  it("maps IPv4-mapped IPv6 to IPv4", () => {
    expect(parseIp("::ffff:1.2.3.4")).toEqual(parseIp("1.2.3.4"));
    expect(parseIp("::FFFF:102:304")).toEqual(parseIp("1.2.3.4"));
    expect(parseIp("0:0:0:0:0:ffff:1.2.3.4")).toEqual(parseIp("1.2.3.4"));
  });
});

describe("stripPort", () => {
  it.each([
    ["1.2.3.4", "1.2.3.4"],
    ["1.2.3.4:5678", "1.2.3.4"],
    ["[::1]:80", "::1"],
    ["[fd7a:115c:a1e0::1]", "fd7a:115c:a1e0::1"],
    ["fd7a:115c:a1e0::1", "fd7a:115c:a1e0::1"],
    ["  1.2.3.4  ", "1.2.3.4"],
    ["::ffff:1.2.3.4", "::ffff:1.2.3.4"],
  ])("%j -> %j", (input, out) => {
    expect(stripPort(input)).toBe(out);
  });
});

describe("createAllowList: feature off", () => {
  it.each([undefined, "", "   ", ",", " , ,"])("%j means disabled and allows everything", (raw) => {
    const list = createAllowList(raw);
    expect(list.enabled).toBe(false);
    expect(list.isAllowed("8.8.8.8")).toBe(true);
  });
});

describe("createAllowList: matching", () => {
  const list = createAllowList("100.101.102.103, 100.64.0.0/10 fd7a:115c:a1e0::/48,\n192.168.1.5");
  it("is enabled", () => expect(list.enabled).toBe(true));
  it("matches exact IPv4 and IPv4 ranges (any separator mix)", () => {
    expect(list.isAllowed("100.101.102.103")).toBe(true);
    expect(list.isAllowed("100.64.0.0")).toBe(true);
    expect(list.isAllowed("100.127.255.255")).toBe(true);
    expect(list.isAllowed("192.168.1.5")).toBe(true);
  });
  it("rejects addresses just outside", () => {
    expect(list.isAllowed("100.63.255.255")).toBe(false);
    expect(list.isAllowed("100.128.0.0")).toBe(false);
    expect(list.isAllowed("192.168.1.6")).toBe(false);
    expect(list.isAllowed("8.8.8.8")).toBe(false);
  });
  it("matches IPv6 ranges", () => {
    expect(list.isAllowed("fd7a:115c:a1e0::1")).toBe(true);
    expect(list.isAllowed("fd7a:115c:a1e0:ffff:ffff:ffff:ffff:ffff")).toBe(true);
    expect(list.isAllowed("fd7a:115c:a1e1::1")).toBe(false);
    expect(list.isAllowed("::1")).toBe(false);
  });
  it("treats IPv4-mapped IPv6 clients as their IPv4 address", () => {
    expect(list.isAllowed("::ffff:100.101.102.103")).toBe(true);
    expect(list.isAllowed("::ffff:8.8.8.8")).toBe(false);
  });
  it("tolerates whitespace and a port suffix on the client address", () => {
    expect(list.isAllowed(" 100.101.102.103:4444 ")).toBe(true);
    expect(list.isAllowed("[fd7a:115c:a1e0::1]:443")).toBe(true);
    expect(list.isAllowed("8.8.8.8:100")).toBe(false);
  });
  it("denies anything unparseable, empty or missing (default deny)", () => {
    for (const bad of ["", "unknown", "100.101.102", "100.101.102.103.5", "null", undefined, "100.101.102.103, 8.8.8.8"]) {
      expect(list.isAllowed(bad)).toBe(false);
    }
  });
  it("/0 and /32 /128 edges", () => {
    expect(createAllowList("0.0.0.0/0").isAllowed("9.9.9.9")).toBe(true);
    expect(createAllowList("0.0.0.0/0").isAllowed("::1")).toBe(false);
    expect(createAllowList("1.2.3.4/32").isAllowed("1.2.3.5")).toBe(false);
    expect(createAllowList("::1/128").isAllowed("::1")).toBe(true);
    expect(createAllowList("::/0").isAllowed("fd7a::1")).toBe(true);
  });
  it("an IPv4-mapped entry means the IPv4 address", () => {
    expect(createAllowList("::ffff:1.2.3.4").isAllowed("1.2.3.4")).toBe(true);
    expect(createAllowList("::ffff:1.2.3.0/120").isAllowed("1.2.3.99")).toBe(true);
    expect(createAllowList("::ffff:1.2.3.0/120").isAllowed("1.2.4.1")).toBe(false);
  });
});

describe("createAllowList: strict validation (never silently allow)", () => {
  it.each([
    "100.101.102",
    "100.64.0.0/33",
    "100.64.0.0/",
    "100.64.0.0/-1",
    "100.64.0.0/1.5",
    "100.64.0.0/ 10",
    "fd7a::/129",
    "100.64.0.1/10", // host bits set: probably a typo, refuse
    "::ffff:1.2.3.0/64", // mapped prefix shorter than 96 is ambiguous
    "*",
    "all",
    "localhost",
    "1.2.3.4:80",
    "[::1]",
    "1.2.3.4-1.2.3.9",
    "100.101.102.103;8.8.8.8",
    "01.2.3.4",
  ])("throws AllowListError for %j", (raw) => {
    expect(() => createAllowList(raw)).toThrow(AllowListError);
  });
  it("one bad entry among good ones fails the whole value and names the entry", () => {
    expect(() => createAllowList("100.101.102.103, oops, 1.2.3.4")).toThrow(/oops/);
  });
});

// The same table is run by the shell validator behind check-env.sh (scripts/prod/prod-scripts.test.ts): the two cannot drift.
describe("shared valid/invalid table (allowlist-cases.json)", () => {
  const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "allowlist-cases.json"), "utf8")) as { valid: string[]; invalid: string[] };
  it.each(table.valid)("accepts %j", (raw) => {
    expect(() => createAllowList(raw)).not.toThrow();
  });
  it.each(table.invalid)("rejects %j", (raw) => {
    expect(() => createAllowList(raw)).toThrow(AllowListError);
  });
});
