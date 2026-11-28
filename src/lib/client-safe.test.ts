// @vitest-environment node
// Guards the client/server split: these files are bundled into the browser, so they (and everything they import
// at runtime) must not reach node:*, the database, the content loader or other server-only modules.
// `import type` is erased at build time and is ignored.
import fs from "node:fs";
import { builtinModules } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const src = path.resolve(import.meta.dirname, "..");
const CLIENT_SAFE = [
  "lib/answers/normalize.ts",
  "lib/answers/grade.ts",
  "lib/attempts/contract.ts",
  "lib/attempts/derive.ts",
  "lib/attempts/unlock.ts",
  "lib/offline/sink.ts",
  "lib/offline/http-sink.ts",
  "lib/practice/replay.ts",
  // the checkpoint gate and scorer are pure: the player and the pages share them with the server
  "lib/checkpoints/gate.ts",
  "lib/checkpoints/score.ts",
  // vocabulary review: the scheduler runs in the browser for the interval under each button
  "lib/srs/config.ts",
  "lib/srs/contract.ts",
  "lib/srs/scheduler.ts",
  "lib/srs/zone.ts",
  "lib/srs/format.ts",
  "lib/srs/queue.ts",
  "lib/srs/initial.ts",
  "lib/srs/simulate.ts",
  // the review screen is bundled into the browser: the card loader and the queries must not leak into it
  "components/review/ReviewApp.tsx",
  "components/review/ReviewSession.tsx",
  "components/exercises/ui/radio.ts",
  "components/exercises/ui/tone.ts",
  "lib/audio/source.ts",
  "lib/audio/context.tsx",
  "components/exercises/types.ts",
  // the real client entry points: a server import anywhere in the player tree is caught
  "components/player/DayPlayer.tsx",
  "components/player/CompletionScreen.tsx",
  "components/exercises/registry.tsx",
  // the checkpoint screens run in the browser: the queries and the content loader must not reach them
  "components/checkpoint/CheckpointApp.tsx",
  "components/checkpoint/view.ts",
];

const BUILTINS = new Set(builtinModules.filter((m) => !m.startsWith("_")).flatMap((m) => [m, m.replace(/\/.*$/, "")]));
const FORBIDDEN_PACKAGES = new Set(["next/headers", "next/server", "server-only", "pg", "postgres", "drizzle-orm", "drizzle-kit"]);
// lib/progress is server-side except its pure date and config helpers (dates.ts -> config.ts -> sources.ts -> types.ts),
// which the review queue needs for "today" in the learner's time zone.
const FORBIDDEN_SRC = [/^(lib\/)?db(\/|$)/, /^lib\/content\/(loader|repo|validate|cli)$/, /^lib\/server(\/|$)/, /^lib\/progress(\/(?!(dates|config|sources|types)$)|$)/];

/** Runtime import specifiers: static imports, re-exports and dynamic imports. Type-only ones are skipped. */
function runtimeSpecifiers(code: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^"';]*?)\s*from\s*["']([^"']+)["']|(?:^|[\n;])\s*import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of code.matchAll(re)) {
    if (m[4] !== undefined) {
      const typeOnly = Boolean(m[2]) || /^\{\s*(type\s+[^,}]+,?\s*)+\}$/.test(m[3]);
      if (!typeOnly) out.push(m[4]);
    } else out.push(m[5] ?? m[6] ?? m[7]);
  }
  return out;
}

const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
function resolveLocal(root: string, from: string, spec: string): { rel: string; abs: string } | undefined {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)) : undefined;
  if (base === undefined) return undefined;
  for (const c of CANDIDATES) {
    const abs = path.join(root, base + c);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return { rel: base + c, abs };
  }
  return { rel: base, abs: path.join(root, base) };
}

function isForbidden(spec: string, resolvedRel: string | undefined): boolean {
  if (spec.startsWith("node:") || BUILTINS.has(spec) || BUILTINS.has(spec.replace(/\/.*$/, ""))) return true;
  if (FORBIDDEN_PACKAGES.has(spec)) return true;
  if (resolvedRel === undefined) return false;
  const noExt = resolvedRel.replace(/(\/index)?\.tsx?$/, "");
  return FORBIDDEN_SRC.some((re) => re.test(noExt));
}

/** Every forbidden import reachable at runtime from `entries` (paths relative to `root`), as `file -> spec`. */
function findViolations(root: string, entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const visit = (rel: string) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      found.push(`${rel} -> (file does not exist)`);
      return;
    }
    for (const spec of runtimeSpecifiers(fs.readFileSync(abs, "utf8"))) {
      const local = resolveLocal(root, rel, spec);
      if (isForbidden(spec, local?.rel)) found.push(`${rel} -> ${spec}`);
      else if (local) visit(local.rel);
    }
  };
  entries.forEach(visit);
  return found;
}

describe("client-safe files (and everything they import)", () => {
  it.each(CLIENT_SAFE)("%s reaches nothing server-only", (file) => {
    expect(findViolations(src, [file])).toEqual([]);
  });
});

describe("the checker itself", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  const project = (files: Record<string, string>) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-"));
    dirs.push(root);
    for (const [f, code] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), code);
    }
    return root;
  };

  it("flags direct forbidden imports", () => {
    const root = project({
      "a.ts": [
        'import fs from "node:fs";', 'import { readFile } from "fs/promises";', 'import { randomUUID } from "crypto";',
        'import u from "util";', 'import p from "path";', 'import o from "os";', 'import c from "child_process";',
        'import { cookies } from "next/headers";', 'import { db } from "@/db";', 'import s from "@/db/schema";',
        'import l from "@/lib/content/loader";', 'import r from "@/lib/content/repo";', 'import "server-only";',
      ].join("\n"),
    });
    expect(findViolations(root, ["a.ts"]).map((v) => v.split(" -> ")[1])).toEqual([
      "node:fs", "fs/promises", "crypto", "util", "path", "os", "child_process", "next/headers", "@/db", "@/db/schema",
      "@/lib/content/loader", "@/lib/content/repo", "server-only",
    ]);
  });
  it("walks relative and alias imports recursively", () => {
    const root = project({
      "lib/a.ts": 'import { b } from "./b";\nexport const a = b;',
      "lib/b.ts": 'import { c } from "@/lib/deep/c";\nexport const b = c;',
      "lib/deep/c.ts": 'import fs from "node:fs";\nexport const c = fs;',
    });
    expect(findViolations(root, ["lib/a.ts"])).toEqual(["lib/deep/c.ts -> node:fs"]);
  });
  it("follows re-exports and index files, and flags dynamic imports", () => {
    const root = project({
      "a.ts": 'export * from "./x";\nexport { y } from "./y";\nconst z = await import("node:fs");',
      "x/index.ts": 'import { db } from "../db/client";\nexport const x = db;',
      "y.ts": 'export const y = require("os");',
      "db/client.ts": "export const db = 1;",
    });
    expect(findViolations(root, ["a.ts"]).sort()).toEqual(["a.ts -> node:fs", "x/index.ts -> ../db/client", "y.ts -> os"]);
  });
  it("ignores type-only imports and allows ordinary packages", () => {
    const root = project({
      "a.ts": 'import type { X } from "@/db/schema";\nimport { type Y } from "@/db/schema";\nexport type { Z } from "node:fs";\nimport { z } from "zod";\nimport React from "react";\nexport const a = 1;',
    });
    expect(findViolations(root, ["a.ts"])).toEqual([]);
  });
  it("reports a missing entry file instead of passing silently", () => {
    expect(findViolations(project({}), ["nope.ts"])).toEqual(["nope.ts -> (file does not exist)"]);
  });
  it("lets the pure progress helpers through but still flags the rest of lib/progress", () => {
    const root = project({
      "lib/progress/dates.ts": "export const a = 1;", "lib/progress/config.ts": "export const a = 1;",
      "lib/progress/sources.ts": "export const a = 1;", "lib/progress/types.ts": "export const a = 1;",
      "a.ts": [
        'import "@/lib/progress/dates";', 'import "@/lib/progress/config";', 'import "@/lib/progress/sources";', 'import "@/lib/progress/types";',
        'import "@/lib/progress/vocab";', 'import "@/lib/progress/streak";', 'import "@/lib/progress";', 'import "@/lib/progress/index";',
      ].join("\n"),
    });
    expect(findViolations(root, ["a.ts"]).map((v) => v.split(" -> ")[1])).toEqual([
      "@/lib/progress/vocab", "@/lib/progress/streak", "@/lib/progress", "@/lib/progress/index",
    ]);
  });
  it("keeps repo.ts out of the client-safe list", () => {
    expect(CLIENT_SAFE).not.toContain("lib/content/repo.ts");
  });
});
