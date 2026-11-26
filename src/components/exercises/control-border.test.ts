// Text inputs and textareas must use the `control` border token (3:1 against every surface, see tokens.test.ts),
// not the subtle `line` token. Scans the source of every exercise component.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fieldToneClass, toneClass, type Tone } from "./ui/tone";

const dir = path.join(process.cwd(), "src/components/exercises");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));

describe("text field borders use the control token", () => {
  const fields = files.flatMap((f) => {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    return [...src.matchAll(/<(input|textarea)\b[\s\S]*?\/>/g)].map((m) => ({ file: f, tag: m[0] }));
  });

  it("finds the four text fields (FillBlank, Dictation, TranslateThEn, FreeWrite)", () => {
    expect(new Set(fields.map((x) => x.file))).toEqual(new Set(["FillBlank.tsx", "Dictation.tsx", "TranslateThEn.tsx", "FreeWrite.tsx"]));
  });

  it.each(fields.map((x) => [x.file, x.tag] as const))("%s: field has border-control and no border-line", (_file, tag) => {
    expect(tag).toMatch(/border-control|fieldToneClass\(/);
    expect(tag).not.toMatch(/border-line/);
  });
});

describe("fieldToneClass", () => {
  it("uses the control border when idle and the same state colours as toneClass otherwise", () => {
    expect(fieldToneClass("idle")).toMatch(/border-control/);
    expect(fieldToneClass("idle")).not.toMatch(/border-line/);
    for (const t of ["selected", "paired", "right", "wrong"] as Tone[]) expect(fieldToneClass(t)).toBe(toneClass(t));
  });
});
