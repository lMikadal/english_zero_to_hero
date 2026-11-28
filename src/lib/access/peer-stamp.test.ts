// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installPeerStamp } from "./peer-stamp";

let server: http.Server;
let port: number;

beforeAll(async () => {
  installPeerStamp();
  installPeerStamp(); // idempotent: a second install must not double-wrap
  server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ peer: req.headers["x-ezh-peer"], xff: req.headers["x-ezh-xff"], rawXff: req.headers["x-forwarded-for"], count: req.rawHeaders.filter((h) => h.toLowerCase().startsWith("x-ezh-")).length }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const get = async (headers: Record<string, string> = {}) => (await fetch(`http://127.0.0.1:${port}/`, { headers })).json() as Promise<{ peer: string; xff: string; rawXff?: string; count: number }>;

describe("installPeerStamp", () => {
  it("stamps the TCP peer address on every request", async () => {
    expect((await get()).peer).toBe("127.0.0.1");
  });
  it("records the forwarded-for header exactly as received, empty when absent", async () => {
    expect((await get()).xff).toBe("");
    expect((await get({ "x-forwarded-for": "100.101.102.103" })).xff).toBe("100.101.102.103");
  });
  it("client-supplied x-ezh-* headers are discarded, never trusted", async () => {
    const r = await get({ "x-ezh-peer": "100.101.102.103", "x-ezh-xff": "100.101.102.103" });
    expect(r.peer).toBe("127.0.0.1");
    expect(r.xff).toBe("");
  });
  it("leaves x-forwarded-for itself alone", async () => {
    expect((await get({ "x-forwarded-for": "1.2.3.4" })).rawXff).toBe("1.2.3.4");
  });
});
