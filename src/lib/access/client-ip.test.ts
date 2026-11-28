// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAllowList } from "./allowlist";
import { DEFAULT_TRUSTED_PROXIES, resolveClient } from "./client-ip";

const trusted = createAllowList(DEFAULT_TRUSTED_PROXIES);
const resolve = (peer: string | null, forwardedFor: string | null, proxyHeaders = false) => resolveClient({ peer, forwardedFor, proxyHeaders, trusted });

describe("resolveClient", () => {
  it("a peer that is not a trusted proxy is judged by its own address; forwarded headers are ignored (anti-spoofing)", () => {
    expect(resolve("203.0.113.9", "100.101.102.103")).toEqual({ kind: "ip", ip: "203.0.113.9" });
    expect(resolve("192.168.1.20", null)).toEqual({ kind: "ip", ip: "192.168.1.20" });
    expect(resolve("::ffff:203.0.113.9", "100.101.102.103")).toEqual({ kind: "ip", ip: "203.0.113.9" });
    expect(resolve("2001:db8::5", "100.101.102.103")).toEqual({ kind: "ip", ip: "2001:db8::5" });
  });
  it("a trusted peer (loopback, docker bridge) without forwarded header is a request made on the host itself", () => {
    expect(resolve("127.0.0.1", null)).toEqual({ kind: "local" });
    expect(resolve("::1", "")).toEqual({ kind: "local" });
    expect(resolve("::ffff:127.0.0.1", "  ")).toEqual({ kind: "local" });
    expect(resolve("172.18.0.1", null)).toEqual({ kind: "local" });
    expect(resolve("::ffff:172.17.0.1", null)).toEqual({ kind: "local" });
  });
  it("a trusted peer with a forwarded header is judged by the forwarded address", () => {
    expect(resolve("172.18.0.1", "100.101.102.103")).toEqual({ kind: "ip", ip: "100.101.102.103" });
    expect(resolve("127.0.0.1", "[fd7a:115c:a1e0::1]:443")).toEqual({ kind: "ip", ip: "fd7a:115c:a1e0::1" });
    expect(resolve("127.0.0.1", "100.101.102.103:51000")).toEqual({ kind: "ip", ip: "100.101.102.103" });
  });
  it("uses the right-most entry: what the nearest trusted proxy appended, not what the client claimed", () => {
    expect(resolve("127.0.0.1", "8.8.8.8, 100.101.102.103")).toEqual({ kind: "ip", ip: "100.101.102.103" });
    expect(resolve("127.0.0.1", "100.101.102.103, 8.8.8.8")).toEqual({ kind: "ip", ip: "8.8.8.8" });
  });
  it("garbage is unknown (denied when the feature is on), never local", () => {
    expect(resolve("127.0.0.1", "unknown")).toEqual({ kind: "unknown" });
    expect(resolve("127.0.0.1", "1.2.3.4, ")).toEqual({ kind: "unknown" });
    expect(resolve("127.0.0.1", ",")).toEqual({ kind: "unknown" });
    expect(resolve(null, "100.101.102.103")).toEqual({ kind: "unknown" });
    expect(resolve("", null)).toEqual({ kind: "unknown" });
    expect(resolve("not-an-ip", null)).toEqual({ kind: "unknown" });
  });
  it("S2: a trusted peer is 'this machine' only when the request carries NO proxy headers at all", () => {
    expect(resolve("172.18.0.1", null, true)).toEqual({ kind: "unknown" });
    expect(resolve("127.0.0.1", "", true)).toEqual({ kind: "unknown" });
    expect(resolve("127.0.0.1", "  ", true)).toEqual({ kind: "unknown" });
  });
  it("S2: a usable forwarded address still decides, whatever other proxy headers are present", () => {
    expect(resolve("172.18.0.1", "100.101.102.103", true)).toEqual({ kind: "ip", ip: "100.101.102.103" });
  });
  it("S2: proxy headers from a non-proxy peer change nothing (it is judged by its own address)", () => {
    expect(resolve("203.0.113.9", null, true)).toEqual({ kind: "ip", ip: "203.0.113.9" });
  });
});
