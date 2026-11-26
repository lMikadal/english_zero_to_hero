import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findRawColors } from "./color-scan";

describe("findRawColors (self-test: the guard catches violations)", () => {
  it.each([
    ['className="bg-white"', "bg-white"],
    ['className="text-slate-700 p-2"', "text-slate-700"],
    ['"hover:border-green-600"', "border-green-600"],
    ['"ring-4 ring-sky-300"', "ring-sky-300"],
    ['"bg-[#fff]"', "[#fff]"],
    ['"text-[rgb(1,2,3)]"', "rgb("],
    ["color: #ff0000;", "#ff0000"],
    ["background: hsl(10 20% 30%)", "hsl("],
    ['"bg-zinc-50/50"', "bg-zinc-50"],
  ])("flags %s", (line, hit) => {
    const found = findRawColors(line);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((f) => f.includes(hit))).toBe(true);
  });

  it.each([
    'className="bg-card text-fg border-line"',
    'className="bg-good-soft text-good-fg ring-ring"',
    'className="text-right text-muted"',
    "const href = `/day/${n}#section`",
    'className="whitespace-pre-line text-white-space"',
    'className="border-b border-line"',
  ])("allows %s", (line) => {
    expect(findRawColors(line)).toEqual([]);
  });
});

describe("no raw colours in src/ (use the tokens in src/app/globals.css)", () => {
  const EXEMPT = new Set(["src/app/globals.css", "src/lib/theme/color-scan.ts", "src/lib/theme/color-scan.test.ts", "src/lib/theme/tokens.test.ts"]);
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : /\.(ts|tsx|css)$/.test(e.name) ? [p] : [];
    });
  }
  const files = walk(path.join(process.cwd(), "src")).map((p) => path.relative(process.cwd(), p)).filter((p) => !EXEMPT.has(p));

  it("scans a non-trivial number of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("finds none", () => {
    const violations = files.flatMap((f) => findRawColors(fs.readFileSync(f, "utf8")).map((v) => `${f}: ${v}`));
    expect(violations).toEqual([]);
  });
});
