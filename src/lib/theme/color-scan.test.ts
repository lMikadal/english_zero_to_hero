import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findColorViolations } from "./color-scan";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const TOKENS = [...css.matchAll(/--color-([a-z-]+): var\(/g)].map((m) => m[1]);
const scan = (text: string) => findColorViolations(text, TOKENS);

describe("colour guard self-test: raw colours are caught", () => {
  it.each([
    ['className="bg-white"', "bg-white"],
    ['className="text-slate-700 p-2"', "text-slate-700"],
    ['"hover:border-green-600"', "border-green-600"],
    ['"ring-4 ring-sky-300"', "ring-sky-300"],
    ['"bg-[#fff]"', "bg-[#fff]"],
    ['"text-[rgb(1,2,3)]"', "rgb("],
    ["color: #ff0000;", "#ff0000"],
    ["background: hsl(10 20% 30%)", "hsl("],
    ['"bg-zinc-50/50"', "bg-zinc-50"],
    ['"bg-[red]"', "bg-[red]"],
    ['"text-[rebeccapurple]"', "text-[rebeccapurple]"],
    ["<div style={{ color: 'red' }} />", "color: 'red'"],
    ['<div style={{ backgroundColor: "tomato" }} />', 'backgroundColor: "tomato"'],
    ['<path fill="red" />', 'fill="red"'],
    ['<path stroke="#333" />', "#333"],
  ])("flags %s", (line, hit) => {
    const found = scan(line);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((f) => f.includes(hit))).toBe(true);
  });
});

describe("colour guard self-test: invented or mistyped tokens are caught", () => {
  it.each([
    ['"text-primary"', "text-primary"],
    ['"bg-good-soft2"', "bg-good-soft2"],
    ['"hover:bg-accentt"', "bg-accentt"],
    ['"has-[:checked]:text-on-acent"', "text-on-acent"],
    ['"border-t-lines"', "border-t-lines"],
    ['"ring-offset-brand"', "ring-offset-brand"],
    ['"outline-focus"', "outline-focus"],
    ['"bg-fg/50 text-mutedd/70"', "text-mutedd"],
    ['"!bg-nope"', "bg-nope"],
    ['"fill-brand"', "fill-brand"],
    ['"shadow-card-glow"', "shadow-card-glow"],
  ])("flags %s", (line, hit) => {
    expect(scan(line).some((f) => f.includes(hit))).toBe(true);
  });
});

describe("colour guard self-test: real tokens and non-colour utilities are allowed", () => {
  it.each([
    'className="bg-card text-fg border-line"',
    'className="bg-good-soft text-good-fg ring-ring"',
    'className="text-right text-muted text-sm text-center text-2xl text-balance"',
    'className="border-b border-t-2 border-2 border-t-line border-x border-dashed"',
    'className="ring-2 ring-4 ring-inset ring-offset-2 ring-offset-bg outline-none outline-2 outline-offset-2 outline-ring"',
    'className="shadow-sm shadow-none drop-shadow-md inset-shadow-xs"',
    'className="has-[:checked]:bg-accent has-[:focus-visible]:outline-offset-2 hover:text-on-accent disabled:bg-surface"',
    'className="bg-fg/50 bg-bg text-bg bg-transparent text-current border-transparent"',
    'className="bg-gradient-to-r from-accent via-surface to-bg bg-cover bg-center bg-no-repeat"',
    'className="divide-y divide-line stroke-2 fill-current stroke-current fill-none"',
    'className="text-[14px] text-[length:var(--x)] border-[3px] bg-[var(--bg)] w-1/2"',
    'className="whitespace-pre-line text-balance"',
    '<svg fill="none" stroke="currentColor" />',
    "<svg fill='transparent' stroke=\"inherit\" />",
    "const href = `/day/${n}#section`",
    "style={{ width: `${pct}%` }}",
    "&#169;",
  ])("allows %s", (line) => {
    expect(scan(line)).toEqual([]);
  });
});

describe("no raw or invented colours in src/ (use the tokens in src/app/globals.css)", () => {
  // Token definitions and the guard itself (its self-tests contain deliberate violations). Migrations are SQL/JSON, not UI.
  const EXEMPT = new Set(["src/app/globals.css", "src/lib/theme/color-scan.ts", "src/lib/theme/color-scan.test.ts", "src/lib/theme/tokens.test.ts"]);
  const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|mp3|wav|ogg)$/i;
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : BINARY.test(e.name) ? [] : [p];
    });
  }
  const files = walk(path.join(process.cwd(), "src"))
    .map((p) => path.relative(process.cwd(), p))
    .filter((p) => !EXEMPT.has(p) && !p.startsWith("src/db/migrations/"));

  it("reads the token list from globals.css", () => {
    expect(TOKENS).toEqual(expect.arrayContaining(["bg", "card", "fg", "good-soft", "on-accent", "ring"]));
    expect(TOKENS.length).toBeGreaterThanOrEqual(18);
  });

  it("scans a non-trivial number of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("finds none", () => {
    const violations = files.flatMap((f) => scan(fs.readFileSync(f, "utf8")).map((v) => `${f}: ${v}`));
    expect(violations).toEqual([]);
  });
});
