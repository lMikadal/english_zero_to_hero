// @vitest-environment node
// Guards the client/server split: these files are bundled into the browser, so they must not reach node:*, the
// database, the content loader or the server-only repo (docs/plans/m1-lesson-player-plan.md section 2).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(import.meta.dirname, "..");
const CLIENT_SAFE = [
  "lib/answers/normalize.ts",
  "lib/answers/grade.ts",
  "lib/attempts/contract.ts",
  "lib/attempts/derive.ts",
  "lib/attempts/unlock.ts",
  "lib/offline/sink.ts",
  "lib/audio/source.ts",
  "components/exercises/types.ts",
];

const specifiers = (code: string) =>
  [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm)].map((m) => m[1]);

const forbidden = (spec: string, file: string) => {
  if (spec.startsWith("node:")) return true;
  if (["fs", "path", "os", "child_process"].includes(spec)) return true;
  const resolved = spec.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : spec.replace(/^@\//, "");
  return /^(db|lib\/db)(\/|$)/.test(resolved) || /^lib\/content\/(loader|repo|validate|cli)$/.test(resolved) || /^lib\/(server|progress)(\/|$)/.test(resolved);
};

describe("client-safe files", () => {
  it.each(CLIENT_SAFE)("%s exists and imports nothing server-only", (file) => {
    const code = fs.readFileSync(path.join(src, file), "utf8");
    const bad = specifiers(code).filter((s) => forbidden(s, file));
    expect(bad).toEqual([]);
  });

  it("the checker itself flags the imports it should", () => {
    const code = `import fs from "node:fs";\nimport { db } from "@/db";\nimport x from "../../db/schema";\nimport l from "@/lib/content/loader";\nconst m = await import("@/lib/content/repo");\nimport type { Lesson } from "@/lib/content/schema";`;
    const bad = specifiers(code).filter((s) => forbidden(s, "lib/answers/grade.ts"));
    expect(bad).toEqual(["node:fs", "@/db", "../../db/schema", "@/lib/content/loader", "@/lib/content/repo"]);
  });
});
