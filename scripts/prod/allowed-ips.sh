#!/bin/sh
# Validate an ALLOWED_IPS / TRUSTED_PROXIES value with the same strictness as the app (src/lib/access/allowlist.ts).
# Usage: allowed-ips.sh "<value>" [NAME]    exit 0 = fine (empty = feature off), exit 1 = a message on stderr names the bad entry.
# Both validators run the same table: src/lib/access/allowlist-cases.json (allowlist.test.ts and prod-scripts.test.ts).
# Entries are separated by commas and/or blanks: IPv4/IPv6 address or CIDR; no ports, hostnames, wildcards, zone ids,
# leading zeros, or network addresses with host bits set. IPv4-mapped IPv6 (::ffff:a.b.c.d) means the IPv4 address.
set -eu
value="${1:-}"
name="${2:-ALLOWED_IPS}"
printf '%s\n' "$value" | awk -v name="$name" '
function bad(entry, why) { printf "ERROR: %s: invalid entry \"%s\": %s\n", name, entry, why > "/dev/stderr"; exit 1 }
function pow2(n,   r) { r = 1; while (n-- > 0) r *= 2; return r }
function hexval(h,   i, c, v) { v = 0; h = tolower(h); for (i = 1; i <= length(h); i++) { c = index("0123456789abcdef", substr(h, i, 1)) - 1; v = v * 16 + c } return v }
# IPv4 dotted quad -> number, or -1
function v4(s,   n, p, i) {
  # (no {n} intervals in the patterns: mawk does not support them)
  if (split(s, p, ".") != 4) return -1
  n = 0
  for (i = 1; i <= 4; i++) {
    if (p[i] !~ /^(0|[1-9][0-9]*)$/ || length(p[i]) > 3 || p[i] + 0 > 255) return -1
    n = n * 256 + p[i]
  }
  return n
}
# IPv6 -> fills G[1..8] with the 16-bit groups; returns 1 on success
function v6(s,   tail, lc, n4, head, rest, hn, rn, h, r, i, miss, parts, np) {
  if (s == "" || s ~ /[^0-9a-fA-F:.]/) return 0
  lc = 0
  for (i = length(s); i >= 1; i--) if (substr(s, i, 1) == ":") { lc = i; break }
  tail = substr(s, lc + 1)
  if (index(tail, ".") > 0) {
    n4 = v4(tail); if (n4 < 0) return 0
    s = substr(s, 1, lc) sprintf("%x:%x", int(n4 / 65536), n4 % 65536)
  }
  np = split_dc(s, parts)
  if (np > 2) return 0
  hn = groups(parts[1], h); if (hn < 0) return 0
  if (np == 2) {
    rn = groups(parts[2], r); if (rn < 0) return 0
    miss = 8 - hn - rn; if (miss < 1) return 0
    for (i = 1; i <= hn; i++) G[i] = hexval(h[i])
    for (i = 1; i <= miss; i++) G[hn + i] = 0
    for (i = 1; i <= rn; i++) G[hn + miss + i] = hexval(r[i])
  } else {
    if (hn != 8) return 0
    for (i = 1; i <= 8; i++) G[i] = hexval(h[i])
  }
  return 1
}
# split on "::" (like JS split): parts[1..n]
function split_dc(s, parts,   n, i) {
  n = 0; parts[1] = ""
  while ((i = index(s, "::")) > 0) { n++; parts[n] = substr(s, 1, i - 1); s = substr(s, i + 2); parts[n + 1] = "" }
  parts[n + 1] = s
  return n + 1
}
# "a:b:c" -> arr[1..n], each 1-4 hex digits; "" -> 0; invalid -> -1
function groups(t, arr,   n, i) {
  if (t == "") return 0
  n = split(t, arr, ":")
  if (substr(t, length(t)) == ":") return -1
  for (i = 1; i <= n; i++) if (arr[i] !~ /^[0-9a-fA-F]+$/ || length(arr[i]) > 4) return -1
  return n
}
function check(entry,   slash, addr, pfx, haspfx, ver, val, max, mapped, i, bits, host, rest) {
  slash = index(entry, "/")
  if (slash > 0) { addr = substr(entry, 1, slash - 1); pfx = substr(entry, slash + 1); haspfx = 1 } else { addr = entry; haspfx = 0 }
  if (index(addr, ":") > 0) {
    if (!v6(addr)) bad(entry, "not an IPv4/IPv6 address (ports, hostnames, wildcards and ranges are not allowed)")
    mapped = (G[1] == 0 && G[2] == 0 && G[3] == 0 && G[4] == 0 && G[5] == 0 && G[6] == 65535)
    if (mapped) { ver = 4; val = G[7] * 65536 + G[8]; max = 32 } else { ver = 6; max = 128 }
  } else {
    val = v4(addr)
    if (val < 0) bad(entry, "not an IPv4/IPv6 address (ports, hostnames, wildcards and ranges are not allowed)")
    ver = 4; max = 32; mapped = 0
  }
  if (!haspfx) return
  if (pfx !~ /^(0|[1-9][0-9]*)$/ || length(pfx) > 3) bad(entry, "prefix length must be a whole number without leading zeros")
  pfx = pfx + 0
  if (mapped) { if (pfx < 96) bad(entry, "an IPv4-mapped range needs a prefix of at least 96"); pfx -= 96 }
  if (pfx > max) bad(entry, "prefix length too large")
  if (pfx == 0) bad(entry, "this range matches every address, which is the same as having no allow-list")
  if (pfx < (ver == 4 ? 8 : 16)) printf "WARNING: %s: the range \"%s\" is very broad (/%d of IPv%d) and lets in a very large number of devices\n", name, entry, pfx, ver > "/dev/stderr"
  if (ver == 4) {
    if (val % pow2(32 - pfx) != 0) bad(entry, "host bits are set; write the network address")
  } else {
    for (i = 1; i <= 8; i++) {
      bits = pfx - 16 * (i - 1); if (bits < 0) bits = 0; if (bits > 16) bits = 16
      if (G[i] % pow2(16 - bits) != 0) bad(entry, "host bits are set; write the network address")
    }
  }
}
{
  n = split($0, e, /[ \t,]+/)
  for (k = 1; k <= n; k++) if (e[k] != "") check(e[k])
}'
