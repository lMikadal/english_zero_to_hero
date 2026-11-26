import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** Body of the first rule whose selector starts with `selector` (no nested braces inside the body). */
function ruleBody(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`rule not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function vars(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

const light = vars(ruleBody(':root {'));
const dark = vars(ruleBody(':root[data-theme="dark"] {'));
const darkViaMedia = vars(ruleBody(':root:not([data-theme="light"]) {'));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TOKENS = ["bg", "card", "surface", "line", "fg", "muted", "accent", "on-accent", "good", "bad", "hint", "good-fg", "bad-fg", "hint-fg", "good-soft", "bad-soft", "hint-soft", "ring", "control"];
const SURFACES = ["bg", "card", "surface"];
// Every text token paired with every background it is actually drawn on.
const TEXT_PAIRS: [string, string][] = [
  ...["fg", "muted", "good-fg", "bad-fg", "hint-fg"].flatMap((t) => SURFACES.map((s): [string, string] => [t, s])),
  ["fg", "good-soft"], ["fg", "bad-soft"], ["fg", "hint-soft"], ["muted", "good-soft"], ["muted", "bad-soft"], ["muted", "hint-soft"],
  ["good-fg", "good-soft"], ["bad-fg", "bad-soft"], ["hint-fg", "hint-soft"],
  ["on-accent", "accent"],
];

describe("design tokens (src/app/globals.css)", () => {
  it("defines every token in light (:root) and dark ([data-theme=dark])", () => {
    expect(Object.keys(light).sort()).toEqual([...TOKENS].sort());
    expect(Object.keys(dark).sort()).toEqual([...TOKENS].sort());
  });

  it("uses the approved palette from design/README.md", () => {
    expect(dark).toMatchObject({ bg: "#0e1116", card: "#161b22", surface: "#1d232c", line: "#2a323d", fg: "#e8ecf1", muted: "#97a1af", accent: "#7c9cff", good: "#4cc38a", bad: "#f0717b", hint: "#d8b25a" });
    expect(light).toMatchObject({ bg: "#f7f8fa", card: "#ffffff", surface: "#f0f2f5", line: "#d9dee5", fg: "#151a21", muted: "#5b6573", accent: "#3557d6", good: "#1f8a5b", bad: "#c8323f", hint: "#8a6a12" });
  });

  it("system mode: the prefers-color-scheme block carries exactly the dark values", () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(darkViaMedia).toEqual(dark);
  });

  it("sets color-scheme in every theme block (light, system-dark media block, explicit dark)", () => {
    expect(ruleBody(":root {")).toMatch(/color-scheme:\s*light\s*;/);
    expect(ruleBody(':root:not([data-theme="light"]) {')).toMatch(/color-scheme:\s*dark\s*;/);
    expect(ruleBody(':root[data-theme="dark"] {')).toMatch(/color-scheme:\s*dark\s*;/);
  });

  it("keeps the global :focus-visible rule inside @layer base, so Tailwind utilities (outline-none) can override it", () => {
    const layer = css.indexOf("@layer base {");
    expect(layer).toBeGreaterThanOrEqual(0);
    let depth = 0;
    let end = -1;
    for (let i = css.indexOf("{", layer); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    const rule = css.indexOf(":focus-visible");
    expect(rule).toBeGreaterThan(layer);
    expect(rule).toBeLessThan(end);
    expect(css.indexOf(":focus-visible", rule + 1)).toBe(-1); // exactly one such rule
  });

  it("exposes every token as a Tailwind theme colour", () => {
    for (const t of TOKENS) expect(css, t).toContain(`--color-${t}: var(--${t});`);
  });

  for (const [name, palette] of [["light", light], ["dark", dark]] as const) {
    describe(`${name}: WCAG AA`, () => {
      for (const [fg, bg] of TEXT_PAIRS) {
        it(`text-${fg} on ${bg} is at least 4.5:1`, () => {
          expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
        });
      }
      for (const nonText of ["accent", "ring", "good", "bad"]) {
        it(`${nonText} against the page background is at least 3:1 (non-text)`, () => {
          expect(contrast(palette[nonText], palette.bg)).toBeGreaterThanOrEqual(3);
        });
      }
      // Borders of text inputs and textareas are the only cue that a field is editable: they need 3:1 on every surface
      // a field can sit on (border-line is deliberately subtle and is for dividers and cards).
      for (const surface of SURFACES) {
        it(`control (input border) against ${surface} is at least 3:1 (non-text)`, () => {
          expect(contrast(palette.control, palette[surface])).toBeGreaterThanOrEqual(3);
        });
      }
    });
  }
});
