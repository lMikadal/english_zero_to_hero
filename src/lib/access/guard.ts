import { AllowListError, createAllowList, type AllowList } from "./allowlist";
import { DEFAULT_TRUSTED_PROXIES, FORWARDED_HEADER, PEER_HEADER, resolveClient } from "./client-ip";

export type AccessEnv = { ALLOWED_IPS?: string; TRUSTED_PROXIES?: string };
export type Decision = { allowed: true } | { allowed: false; ip: string | null };

const cache = new Map<string, AllowList>();
function list(raw: string): AllowList {
  let l = cache.get(raw);
  if (!l) {
    l = createAllowList(raw); // throws AllowListError on malformed input
    if (cache.size > 8) cache.clear();
    cache.set(raw, l);
  }
  return l;
}

/** Validate the env at server start so a typo stops the server instead of silently changing who may connect. */
export function validateAccessEnv(env: AccessEnv): void {
  list(env.ALLOWED_IPS ?? "");
  const t = env.TRUSTED_PROXIES?.trim();
  if (t) {
    const trusted = list(t);
    if (!trusted.enabled) throw new AllowListError("TRUSTED_PROXIES has no usable entry");
  }
}

export function checkAccess(headers: { get(name: string): string | null }, env: AccessEnv): Decision {
  const allow = list(env.ALLOWED_IPS ?? "");
  const trustedRaw = env.TRUSTED_PROXIES?.trim() ? env.TRUSTED_PROXIES : DEFAULT_TRUSTED_PROXIES;
  const trusted = list(trustedRaw);
  if (!allow.enabled) return { allowed: true };
  const client = resolveClient({ peer: headers.get(PEER_HEADER), forwardedFor: headers.get(FORWARDED_HEADER), trusted });
  if (client.kind === "local") return { allowed: true };
  if (client.kind === "unknown") return { allowed: false, ip: null };
  return allow.isAllowed(client.ip) ? { allowed: true } : { allowed: false, ip: client.ip };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Standalone page (it cannot rely on app CSS): system colours via `color-scheme`, no colour literals. */
export function forbiddenHtml(ip: string | null): string {
  const shown = ip === null ? "ไม่ทราบ / unknown" : escapeHtml(ip);
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>403</title>
<style>
:root{color-scheme:light dark}
body{margin:0;padding:24px 16px;font:16px/1.6 system-ui,sans-serif;background:Canvas;color:CanvasText}
main{max-width:32rem;margin:0 auto}
h1{font-size:1.25rem;margin:0 0 .5rem}
code{font-size:1.125rem;overflow-wrap:anywhere}
</style>
</head>
<body>
<main>
<h1>อุปกรณ์นี้ไม่ได้รับอนุญาตให้ใช้แอป</h1>
<p lang="en">This device is not allowed to use this app.</p>
<p>IP: <code>${shown}</code></p>
</main>
</body>
</html>
`;
}

export type DenyLoggerOptions = { write: (line: string) => void; now: () => number; windowMs: number; maxPerWindow: number; maxKeys: number };

/** One line per IP per window and a global cap per window, so a scanner cannot flood the log. */
export function createDenyLogger(o: DenyLoggerOptions): (ip: string | null, path: string) => void {
  const seen = new Map<string, { at: number; suppressed: number }>();
  let windowStart = o.now();
  let lines = 0;
  let globalSuppressed = 0;
  return (ip, path) => {
    const now = o.now();
    if (now - windowStart >= o.windowMs) {
      windowStart = now;
      lines = 0;
    }
    const key = ip ?? "unknown";
    const entry = seen.get(key);
    if (entry && now - entry.at < o.windowMs) {
      entry.suppressed++;
      return;
    }
    if (lines >= o.maxPerWindow) {
      globalSuppressed++;
      if (entry) entry.suppressed++;
      return;
    }
    if (!entry && seen.size >= o.maxKeys) {
      for (const [k, v] of seen) if (now - v.at >= o.windowMs) seen.delete(k);
      if (seen.size >= o.maxKeys) seen.delete(seen.keys().next().value!);
    }
    const suppressed = (entry?.suppressed ?? 0) + globalSuppressed;
    globalSuppressed = 0;
    seen.set(key, { at: now, suppressed: 0 });
    lines++;
    const safePath = path.replace(/[^\x20-\x7e]/g, "?").slice(0, 120);
    o.write(`[access] denied ip=${key} path=${safePath}${suppressed ? ` (+${suppressed} more suppressed)` : ""}`);
  };
}
