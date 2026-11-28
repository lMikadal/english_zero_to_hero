// Pure IP allow-list: parse `ALLOWED_IPS` strictly and answer isAllowed(clientIp).
// IPv4 is held as a 32-bit value and IPv6 as a 128-bit value (bigint). IPv4-mapped IPv6 is folded into IPv4.

export type ParsedIp = { version: 4 | 6; value: bigint };

export class AllowListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllowListError";
  }
}

const BITS = { 4: 32, 6: 128 } as const;

function parseIpv4(s: string): bigint | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const p of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(p)) return null; // no leading zeros (octal ambiguity), ASCII digits only
    const n = Number(p);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function parseIpv6(s: string): bigint | null {
  if (s === "" || /[^0-9a-fA-F:.]/.test(s)) return null;
  let text = s;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  const groupsFromTail: string[] = [];
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (v4 === null) return null;
    groupsFromTail.push(((v4 >> 16n) & 0xffffn).toString(16), (v4 & 0xffffn).toString(16));
    text = text.slice(0, lastColon + 1) + groupsFromTail.join(":");
    // "::1.2.3.4" -> "::102:304"; a trailing ":" before the tail is kept by the slice
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (h: string): string[] | null => {
    if (h === "") return [];
    const g = h.split(":");
    return g.every((x) => /^[0-9a-fA-F]{1,4}$/.test(x)) ? g : null;
  };
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !rest) return null;
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null; // "::" must stand for at least one group
    groups = [...head, ...Array<string>(missing).fill("0"), ...rest];
  } else {
    groups = head;
    if (groups.length !== 8) return null;
  }
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n);
}


/** Fold ::ffff:a.b.c.d into IPv4. */
function fold(version: 4 | 6, value: bigint): ParsedIp {
  if (version === 6 && value >> 32n === 0xffffn) return { version: 4, value: value & 0xffffffffn };
  return { version, value };
}

export function parseIp(input: string): ParsedIp | null {
  let s = input;
  const zone = /^([^%]+)%[A-Za-z0-9_.-]+$/.exec(s);
  if (zone && zone[1].includes(":")) s = zone[1]; // fe80::1%eth0
  if (s.includes(":")) {
    const v = parseIpv6(s);
    return v === null ? null : fold(6, v);
  }
  const v = parseIpv4(s);
  return v === null ? null : { version: 4, value: v };
}

/** Remove whitespace and a port suffix: "1.2.3.4:80", "[::1]:80", "[::1]". Bare IPv6 is left alone. */
export function stripPort(input: string): string {
  const s = input.trim();
  const bracket = /^\[([^\]]*)\](?::\d{1,5})?$/.exec(s);
  if (bracket) return bracket[1];
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(s);
  if (v4port) return v4port[1];
  return s;
}

type Range = { version: 4 | 6; network: bigint; prefix: number };

function parseEntry(entry: string): Range {
  const fail = (why: string): never => {
    throw new AllowListError(`ALLOWED_IPS: invalid entry "${entry}": ${why}`);
  };
  const slash = entry.indexOf("/");
  const addrText = slash === -1 ? entry : entry.slice(0, slash);
  const ip = addrText.includes("%") ? null : parseIp(addrText); // a zone id means nothing in an allow-list entry
  if (!ip) return fail("not an IPv4/IPv6 address (ports, hostnames, wildcards and ranges are not allowed)");
  if (slash === -1) return { version: ip.version, network: ip.value, prefix: BITS[ip.version] };
  const prefixText = entry.slice(slash + 1);
  if (!/^(0|[1-9][0-9]{0,2})$/.test(prefixText)) return fail("prefix length must be a whole number without leading zeros");
  let prefix = Number(prefixText);
  // "::ffff:1.2.3.0/120" is an IPv4 range in disguise; anything shorter than /96 cannot be expressed in IPv4
  if (ip.version === 4 && addrText.includes(":")) {
    if (prefix < 96) return fail("an IPv4-mapped range needs a prefix of at least 96");
    prefix -= 96;
  }
  if (prefix > BITS[ip.version]) return fail(`prefix length too large for IPv${ip.version}`);
  if (prefix === 0) return fail("this range matches every address, which is the same as having no allow-list");
  const hostBits = BigInt(BITS[ip.version] - prefix);
  const network = (ip.value >> hostBits) << hostBits;
  if (network !== ip.value) return fail("host bits are set; write the network address (a typo here would silently widen or shrink access)");
  return { version: ip.version, network, prefix };
}

export type AllowList = {
  /** false when ALLOWED_IPS is unset/empty: the feature is off and everything is allowed */
  readonly enabled: boolean;
  /** accepted but suspicious entries (a range broader than /8 for IPv4, /16 for IPv6) */
  readonly warnings: readonly string[];
  isAllowed(clientIp: string | null | undefined): boolean;
};

export function createAllowList(raw: string | undefined): AllowList {
  const entries = (raw ?? "").split(/[\s,]+/).filter((e) => e !== "");
  if (entries.length === 0) return { enabled: false, warnings: [], isAllowed: () => true };
  const ranges = entries.map(parseEntry); // throws AllowListError on the first malformed entry
  const warnings = ranges
    .filter((r) => r.prefix < (r.version === 4 ? 8 : 16))
    .map((r) => `ALLOWED_IPS: a range this broad (/${r.prefix} of IPv${r.version}) lets in a very large number of devices; is that what you want?`);
  return {
    enabled: true,
    warnings,
    isAllowed(clientIp) {
      if (typeof clientIp !== "string") return false;
      const ip = parseIp(stripPort(clientIp));
      if (!ip) return false;
      return ranges.some((r) => {
        if (r.version !== ip.version) return false;
        const hostBits = BigInt(BITS[r.version] - r.prefix);
        return ip.value >> hostBits === r.network >> hostBits;
      });
    },
  };
}
