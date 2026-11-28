// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";
import * as proxyModule from "./proxy";
import { proxy } from "./proxy";

const req = (p: string, headers: Record<string, string> = {}, method = "GET") => new NextRequest(`http://localhost:3000${p}`, { method, headers });
afterEach(() => vi.unstubAllEnvs());

describe("proxy (the single enforcement point)", () => {
  it("has no matcher: it runs for pages, API routes, _next assets and public files alike", () => {
    expect("config" in proxyModule).toBe(false);
    const src = readFileSync(path.join(__dirname, "proxy.ts"), "utf8");
    expect(src).not.toMatch(/matcher/);
  });
  it("there is no second interception file that Next would refuse or that could shadow it", () => {
    for (const f of ["middleware.ts", "middleware.js", "proxy.js", "src/middleware.ts"]) expect(existsSync(path.join(__dirname, f))).toBe(false);
    expect(existsSync(path.join(__dirname, "..", "middleware.ts"))).toBe(false);
    expect(existsSync(path.join(__dirname, "..", "proxy.ts"))).toBe(false);
  });
  it("feature off: passes every path through", async () => {
    vi.stubEnv("ALLOWED_IPS", "");
    for (const p of ["/", "/api/health", "/_next/static/chunks/a.js", "/sw.js"]) {
      const res = await proxy(req(p, { "x-ezh-peer": "203.0.113.9" }));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });
  it.each(["/", "/day/1", "/api/health", "/api/attempts", "/_next/static/chunks/a.js", "/_next/image?url=%2Ficon.png", "/manifest.webmanifest", "/does/not/exist", "/api/../"])("on: denies %s for a device that is not listed with 403 and the Thai page", async (p) => {
    vi.stubEnv("ALLOWED_IPS", "100.101.102.103");
    const res = await proxy(req(p, { "x-ezh-peer": "172.18.0.1", "x-ezh-xff": "100.200.1.1" }));
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("อุปกรณ์นี้ไม่ได้รับอนุญาตให้ใช้แอป");
    expect(body).toContain("100.200.1.1");
    if (p.length > 1) expect(body).not.toContain(p.split("?")[0]); // the page says nothing about the route
  });
  it("on: denies every HTTP method, not just GET", async () => {
    vi.stubEnv("ALLOWED_IPS", "100.101.102.103");
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
      const res = await proxy(req("/api/attempts", { "x-ezh-peer": "203.0.113.9" }, m));
      expect(res.status).toBe(403);
    }
  });
  it("on: allows the listed device and the host itself", async () => {
    vi.stubEnv("ALLOWED_IPS", "100.101.102.103");
    expect((await proxy(req("/", { "x-ezh-peer": "172.18.0.1", "x-ezh-xff": "100.101.102.103" }))).status).toBe(200);
    expect((await proxy(req("/api/health", { "x-ezh-peer": "172.18.0.1" }))).status).toBe(200);
    expect((await proxy(req("/api/health", { "x-ezh-peer": "127.0.0.1" }))).status).toBe(200);
  });
  it("on: fails closed when the peer stamp is absent (e.g. the hook did not run)", async () => {
    vi.stubEnv("ALLOWED_IPS", "100.101.102.103");
    const res = await proxy(req("/", { "x-forwarded-for": "100.101.102.103" }));
    expect(res.status).toBe(403);
  });
});

describe("instrumentation register (startup)", () => {
  it("is registered where Next looks for it and only touches the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("ALLOWED_IPS", "garbage");
    await expect(register()).resolves.toBeUndefined();
  });
  it("a malformed ALLOWED_IPS makes startup fail loudly", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("ALLOWED_IPS", "100.101.102.103, oops");
    await expect(register()).rejects.toThrow(/oops/);
  });
  it("a malformed TRUSTED_PROXIES makes startup fail loudly", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("ALLOWED_IPS", "100.101.102.103");
    vi.stubEnv("TRUSTED_PROXIES", "nope");
    await expect(register()).rejects.toThrow(/nope/);
  });
  it("a valid configuration installs the peer stamp", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("ALLOWED_IPS", "100.101.102.103");
    await register();
    expect((http.Server.prototype.emit as { ezhPeerStamp?: boolean }).ezhPeerStamp).toBe(true);
  });
});
