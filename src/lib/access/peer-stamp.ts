import http from "node:http";
import { FORWARDED_HEADER, PEER_HEADER } from "./client-ip";

/**
 * Next.js does not give proxy.ts the TCP peer, and it fills x-forwarded-for with the peer only when the client sent none
 * (node_modules/next/dist/server/base-server.js). To know who really connected we stamp two headers on every incoming
 * request before Next sees it: x-ezh-peer (socket address) and x-ezh-xff (x-forwarded-for exactly as received).
 * Anything the client sent under those names is overwritten.
 */
type Stamped = typeof http.Server.prototype.emit & { ezhPeerStamp?: boolean };

export function installPeerStamp(): void {
  const original = http.Server.prototype.emit as Stamped;
  if (original.ezhPeerStamp) return;
  const stamped = function (this: http.Server, event: string | symbol, ...args: unknown[]) {
    if (event === "request") {
      const req = args[0] as http.IncomingMessage;
      const xff = req.headers["x-forwarded-for"];
      req.headers[PEER_HEADER] = req.socket?.remoteAddress ?? "";
      req.headers[FORWARDED_HEADER] = Array.isArray(xff) ? xff.join(",") : (xff ?? "");
    }
    return (original as unknown as (...a: unknown[]) => boolean).call(this, event, ...args);
  } as Stamped;
  stamped.ezhPeerStamp = true;
  http.Server.prototype.emit = stamped as typeof http.Server.prototype.emit;
}
