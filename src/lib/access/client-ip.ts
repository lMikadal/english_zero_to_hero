import { parseIp, stripPort, type AllowList } from "./allowlist";

/** Headers stamped on every request by the peer-stamp hook (see peer-stamp.ts), never by the client. */
export const PEER_HEADER = "x-ezh-peer";
export const FORWARDED_HEADER = "x-ezh-xff";
/** names of the proxy headers (x-forwarded-*, forwarded, x-real-ip, tailscale-*) the client request carried, comma separated; empty = none */
export const PROXY_HEADER = "x-ezh-proxy";

/** Loopback plus Docker's default bridge pools: the published port reaches the container from the bridge gateway (172.x.0.1). */
export const DEFAULT_TRUSTED_PROXIES = "127.0.0.0/8, ::1, 172.16.0.0/12";

export type Client = { kind: "local" } | { kind: "ip"; ip: string } | { kind: "unknown" };

export function resolveClient(input: { peer: string | null; forwardedFor: string | null; proxyHeaders: boolean; trusted: AllowList }): Client {
  const peer = input.peer ? parseIp(stripPort(input.peer)) : null;
  if (!peer) return { kind: "unknown" };
  const peerText = formatIp(peer);
  if (!input.trusted.isAllowed(peerText)) return { kind: "ip", ip: peerText }; // not a proxy: headers are attacker-controlled
  const forwarded = (input.forwardedFor ?? "").trim();
  // "this machine" = a request that carries no proxy header at all. Headers can only be ADDED by a sender, and adding
  // one only causes a refusal, so a proxy that forgot the address can never turn a tailnet device into the host.
  if (forwarded === "") return input.proxyHeaders ? { kind: "unknown" } : { kind: "local" };
  const last = forwarded.split(",").at(-1)!; // nearest proxy's entry; anything left of it was supplied by the client
  const client = parseIp(stripPort(last));
  return client ? { kind: "ip", ip: formatIp(client) } : { kind: "unknown" };
}

/** Canonical text form (IPv4 dotted quad; IPv6 lower-case with the longest zero run compressed). */
function formatIp(ip: { version: 4 | 6; value: bigint }): string {
  if (ip.version === 4) return [24n, 16n, 8n, 0n].map((s) => Number((ip.value >> s) & 255n)).join(".");
  const groups = Array.from({ length: 8 }, (_, i) => Number((ip.value >> BigInt((7 - i) * 16)) & 0xffffn).toString(16));
  // compress the longest run (>= 2) of zero groups
  let best = { at: -1, len: 0 };
  for (let i = 0; i < 8; ) {
    if (groups[i] !== "0") { i++; continue; }
    let j = i;
    while (j < 8 && groups[j] === "0") j++;
    if (j - i > best.len) best = { at: i, len: j - i };
    i = j;
  }
  if (best.len < 2) return groups.join(":");
  return `${groups.slice(0, best.at).join(":")}::${groups.slice(best.at + best.len).join(":")}`;
}

