import http from "node:http";
import { FORWARDED_HEADER, PEER_HEADER, PROXY_HEADER } from "./client-ip";

/**
 * Next.js does not give proxy.ts the TCP peer, and it fills x-forwarded-for with the peer only when the client sent none
 * (node_modules/next/dist/server/base-server.js). To know who really connected we stamp two headers on every incoming
 * request before Next sees it: x-ezh-peer (socket address) and x-ezh-xff (x-forwarded-for exactly as received).
 * x-ezh-proxy lists which proxy headers the client request carried (before Next adds its own). Anything the client sent under
 * the x-ezh-* names is overwritten.
 */
const PROXY_HEADER_NAMES = new Set(["forwarded", "x-real-ip"]);

type Stamped = typeof http.Server.prototype.emit & { ezhPeerStamp?: boolean };

export function installPeerStamp(): void {
  const original = http.Server.prototype.emit as Stamped;
  if (original.ezhPeerStamp) return;
  const stamped = function (this: http.Server, event: string | symbol, ...args: unknown[]) {
    if (event === "request") {
      const req = args[0] as http.IncomingMessage;
      const xff = req.headers["x-forwarded-for"];
      const names = Object.keys(req.headers).filter((n) => PROXY_HEADER_NAMES.has(n) || n.startsWith("x-forwarded-") || n.startsWith("tailscale-"));
      req.headers[PROXY_HEADER] = names.join(",");
      req.headers[PEER_HEADER] = req.socket?.remoteAddress ?? "";
      req.headers[FORWARDED_HEADER] = Array.isArray(xff) ? xff.join(",") : (xff ?? "");
    }
    return (original as unknown as (...a: unknown[]) => boolean).call(this, event, ...args);
  } as Stamped;
  stamped.ezhPeerStamp = true;
  http.Server.prototype.emit = stamped as typeof http.Server.prototype.emit;
}
