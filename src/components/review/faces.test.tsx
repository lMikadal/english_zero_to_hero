// The look of each side of a card comes from ONE table (CARD_FACES), and every direction has a face.
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { REVIEW_DIRECTIONS, type ReviewDirection } from "@/lib/srs/contract";
import { CARD_FACES, type CardFace } from "./faces";
import { RatingBar } from "./RatingBar";
import { ReviewCard } from "./ReviewCard";
import { WORDS, newState } from "./test-helpers";

const item = (direction: ReviewDirection) => ({ vocabId: "v-country", direction, state: newState(), ...WORDS.country });
const INTERACTIVE = "button, a, input, textarea, [role=radio]";
const TALL_ENOUGH = /(^|\s)(min-)?h-(1[1-9]|[2-9]\d)(\s|$)/;
const small = (root: ParentNode) =>
  Array.from(root.querySelectorAll(INTERACTIVE)).filter((el) => !TALL_ENOUGH.test(el.getAttribute("class") ?? "")).map((el) => el.outerHTML.slice(0, 80));

describe("CARD_FACES", () => {
  it("is a Record over every ReviewDirection (compile time) with a face for each (runtime)", () => {
    expectTypeOf(CARD_FACES).toEqualTypeOf<Record<ReviewDirection, CardFace>>();
    expect(Object.keys(CARD_FACES).sort()).toEqual([...REVIEW_DIRECTIONS].sort());
  });

  it.each(REVIEW_DIRECTIONS)("%s renders both sides", async (direction) => {
    for (const side of ["front", "back"] as const) {
      const view = renderWithAudio(<ReviewCard item={item(direction)} side={side} />);
      expect(view.container.textContent).not.toBe("");
      view.unmount();
    }
  });

  it("has the labels, hints and reveal buttons of the plan (2.6)", () => {
    expect(CARD_FACES.en_th).toMatchObject({ label: "อังกฤษ → ไทย", hint: "นึกความหมายให้ออกก่อน แล้วค่อยเปิดดู", reveal: "ดูความหมาย" });
    expect(CARD_FACES.th_en).toMatchObject({ label: "ไทย → อังกฤษ", hint: "นึกคำภาษาอังกฤษให้ออกก่อน แล้วค่อยเปิดดู", reveal: "ดูคำศัพท์" });
  });
});

describe("no leak: the th_en front shows only the Thai meaning", () => {
  it("has no English word, IPA, example, audio button, lang=en, aria-label or title; and no audio is touched", () => {
    const audio = fakeAudio();
    const view = renderWithAudio(<ReviewCard item={item("th_en")} side="front" />, audio);
    const html = view.container.innerHTML;
    expect(view.container).toHaveTextContent("ประเทศ");
    for (const secret of ["country", "kʌntri", "Thailand", "ไทยเป็นประเทศที่ใหญ่"]) expect(html).not.toContain(secret);
    expect(view.container.querySelector("[lang]")).toBeNull();
    expect(view.container.querySelectorAll("button, a")).toHaveLength(0);
    expect(view.container.querySelectorAll("[aria-label], [title]")).toHaveLength(0);
    expect(audio.canPlay).not.toHaveBeenCalled();
    expect(audio.play).not.toHaveBeenCalled();
  });
  it("the en_th front is the mirror: English, IPA and audio, no Thai meaning", () => {
    const view = renderWithAudio(<ReviewCard item={item("en_th")} side="front" />);
    expect(view.container.querySelector('[lang="en"]')).toHaveTextContent("country");
    expect(view.container.querySelector('[lang="en-fonipa"]')).toHaveTextContent("/ˈkʌntri/");
    expect(view.container.innerHTML).not.toContain("ประเทศ");
  });
});

describe("touch targets", () => {
  it.each(REVIEW_DIRECTIONS.flatMap((d) => (["front", "back"] as const).map((s) => [d, s] as const)))("%s %s: every interactive element has a 44px class", (d, s) => {
    const view = renderWithAudio(<ReviewCard item={item(d)} side={s} />);
    expect(small(view.container)).toEqual([]);
  });
  it("rating buttons too", () => {
    const { container } = render(<RatingBar labels={{ 1: "10 นาที", 2: "1 วัน", 3: "3 วัน", 4: "7 วัน" }} onRate={() => {}} />);
    expect(container.querySelectorAll("button")).toHaveLength(4);
    expect(small(container)).toEqual([]);
  });
  it("self-test: a small button is caught", () => {
    const { container } = render(<button className="px-2">x</button>);
    expect(small(container)).toHaveLength(1);
  });
});

describe("no direction branching outside the face table", () => {
  const roots = [import.meta.dirname, path.resolve(import.meta.dirname, "../../app/(learn)/review")];
  /** Every source file under `dir`, subfolders included, except tests, test helpers and the face table itself. */
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) && !/\.test\.|test-helpers|^faces\.ts$/.test(e.name) ? [full] : [];
    });
  const files = roots.flatMap(walk);
  it("finds the components to check, in subfolders and in the review page too", () => {
    const names = files.map((f) => path.basename(f));
    expect(names).toEqual(expect.arrayContaining(["ReviewCard.tsx", "ReviewSession.tsx", "RatingBar.tsx", "session-state.ts", "page.tsx"]));
    expect(files.some((f) => f.includes(`${path.sep}review${path.sep}page.tsx`))).toBe(true);
  });
  const PATTERNS: [string, RegExp][] = [
    ["direction compared", /direction\s*[!=]==?/],
    ["switch on direction", /switch\s*\(\s*[\w.]*direction/i],
    ["direction literal", /["']en_th["']|["']th_en["']/],
    ["REVIEW_DIRECTIONS includes", /REVIEW_DIRECTIONS\s*\.\s*(includes|indexOf)/],
    ["direction string method", /direction\s*\??\.\s*(startsWith|endsWith|includes|indexOf|match|test|slice|split)\s*\(/],
    ["direction in a regex test", /\.test\s*\(\s*[\w.]*direction/],
  ];
  it.each(PATTERNS)("no file has: %s", (_n, re) => {
    for (const f of files) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(re);
  });
  it("self-test: the patterns catch a branch", () => {
    const caught = (code: string) => PATTERNS.some(([, re]) => re.test(code));
    expect(caught('if (item.direction === "th_en") x()')).toBe(true);
    expect(caught("switch (c.direction) {")).toBe(true);
    expect(caught("switch (direction) {")).toBe(true);
    expect(caught('if (card.direction.startsWith("th")) x()')).toBe(true);
    expect(caught('const isMirror = direction?.endsWith("en")')).toBe(true);
    expect(caught("const face = CARD_FACES[card.direction];")).toBe(false);
  });
});
