// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContentError, loadAllLessons, loadLesson, loadVocabBank, readContent } from "./loader";
import { validateContentDir } from "./validate";

const bi = { en: "Hello", th: "สวัสดี" };
const lesson = (day: number) => ({
  day, phase: 1, week: 1, type: "lesson", cefr: "A1", title: bi, objectives: [bi], estimatedMinutes: 20,
  vocab: ["v-hello"],
  sections: [{ skill: "listening", title: bi, exercises: [
    { id: `d${String(day).padStart(3, "0")}-listen-01`, type: "dictation", instruction: { th: "ก" }, audioText: "Hi." },
  ] }],
});
const word = {
  id: "v-hello", word: "hello", pos: "exclamation", oxford: { list: "3000", level: "A1" },
  ipa: { us: "/x/", uk: "/x/" }, th: "สวัสดี", topics: ["greetings"], examples: [{ en: "Hello.", th: "สวัสดี" }],
};

let root: string;
const write = (rel: string, data: unknown) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data));
};

beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ezh-content-")), "content");
});
afterEach(() => {
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

describe("loader", () => {
  it("loads one lesson by day", () => {
    write("lessons/day-001.json", lesson(1));
    expect(loadLesson(1, root).day).toBe(1);
  });

  it("loads all lessons sorted by day", () => {
    write("lessons/day-002.json", lesson(2));
    write("lessons/day-001.json", lesson(1));
    expect(loadAllLessons(root).map((l) => l.day)).toEqual([1, 2]);
  });

  it("loads the whole vocab bank from every file under vocab/**", () => {
    write("vocab/oxford-3000/a1.json", [word]);
    write("vocab/oxford-5000/b2-c1.json", [{ ...word, id: "v-x", oxford: { list: "5000", level: "C1" } }]);
    expect(loadVocabBank(root).map((v) => v.id).sort()).toEqual(["v-hello", "v-x"]);
  });

  it("names the file and the JSON path when the schema fails", () => {
    const bad = lesson(1);
    (bad.sections[0].exercises[0] as Record<string, unknown>).audioTxt = "typo";
    write("lessons/day-001.json", bad);
    let err: unknown;
    try { loadLesson(1, root); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ContentError);
    const msg = (err as ContentError).message;
    expect(msg).toContain("content/lessons/day-001.json");
    expect(msg).toContain("sections[0].exercises[0]");
    expect(msg).toContain("audioTxt");
    expect(msg).toContain("[d001-listen-01]");
  });

  it("reports invalid JSON with the file name", () => {
    write("lessons/day-001.json", "{ not json");
    expect(() => loadLesson(1, root)).toThrow(/content\/lessons\/day-001\.json.*JSON/s);
  });

  it("reports a missing lesson", () => {
    expect(() => loadLesson(9, root)).toThrow(/day-009\.json/);
  });

  it("readContent collects problems from several files instead of stopping", () => {
    write("lessons/day-001.json", { ...lesson(1), phase: 9 });
    write("lessons/day-002.json", "oops");
    write("vocab/oxford-3000/a1.json", [{ ...word, topics: [] }]);
    const r = readContent(root);
    expect(r.problems.map((p) => p.file).sort()).toEqual([
      "content/lessons/day-001.json", "content/lessons/day-002.json", "content/vocab/oxford-3000/a1.json",
    ]);
  });
});

describe("validateContentDir", () => {
  it("passes on consistent content and summarises it", () => {
    write("lessons/day-001.json", lesson(1));
    write("vocab/oxford-3000/a1.json", [word]);
    const r = validateContentDir(root);
    expect(r.problems).toEqual([]);
    expect(r.summary).toEqual({ lessons: 1, words: 1, introduced: 1, notIntroduced: 0 });
  });

  it("combines schema problems and cross-file problems", () => {
    write("lessons/day-001.json", lesson(1)); // references v-hello, which is missing
    write("lessons/day-002.json", "oops");
    const r = validateContentDir(root);
    expect(r.problems.length).toBeGreaterThanOrEqual(2);
  });
});
