// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContentError, loadAllLessons, loadCheckpoint, loadLesson, loadVocabBank, readContent } from "./loader";
import { validateContentDir } from "./validate";

const bi = { en: "Hello", th: "สวัสดี" };
const lesson = (day: number) => ({
  day, phase: 1, week: 1, type: "lesson", cefr: "A1", title: bi, objectives: [bi], estimatedMinutes: 20,
  vocab: ["v-hello"],
  sections: [{ skill: "listening", title: bi, exercises: [
    { id: `d${String(day).padStart(3, "0")}-listen-01`, type: "dictation", instruction: { th: "ก" }, audioText: "Hello." },
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
    write("vocab/oxford-3000/a1.json", [word]);
    expect(loadAllLessons(root).map((l) => l.day)).toEqual([1, 2]);
  });

  it("loads the whole vocab bank from every file under vocab/**", () => {
    write("lessons/day-001.json", lesson(1));
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
    write("vocab/oxford-3000/a2.json", [{ ...word, id: "v-b", oxford: { list: "3000", level: "A2" } }]);
    const r = readContent(root);
    expect([...new Set(r.problems.map((p) => p.file))].sort()).toEqual([
      "content/lessons/day-001.json", "content/lessons/day-002.json", "content/vocab/oxford-3000/a1.json",
    ]);
  });
});

describe("tree structure (S1) and BOM (N3)", () => {
  const files = () => readContent(root).problems.map((p) => p.file + ": " + p.message).join("\n");
  it("fails when root, lessons/ or vocab/ is missing", () => {
    expect(files()).toMatch(/not found/);
    fs.mkdirSync(path.join(root, "vocab"), { recursive: true });
    expect(files()).toMatch(/lessons.*not found/);
    fs.rmSync(path.join(root, "vocab"), { recursive: true });
    fs.mkdirSync(path.join(root, "lessons"), { recursive: true });
    expect(files()).toMatch(/vocab.*not found/);
  });
  it("fails on zero lessons or zero vocab words", () => {
    fs.mkdirSync(path.join(root, "lessons"), { recursive: true });
    fs.mkdirSync(path.join(root, "vocab"), { recursive: true });
    expect(files()).toMatch(/no lesson files/);
    expect(files()).toMatch(/no vocab words/);
  });
  it.each(["day-1.json", "Day-001.json", "day-001.JSON", "day-001.json.bak", "notes.txt", "day-001.jsonc"])(
    "reports stray lessons/ entry %s", (name) => {
      write("lessons/day-001.json", lesson(1));
      write("vocab/oxford-3000/a1.json", [word]);
      write(`lessons/${name}`, "x");
      expect(files()).toContain(`lessons/${name}`);
    });
  it("reports a subdirectory or a directory named like a lesson file in lessons/", () => {
    write("lessons/day-001.json", lesson(1));
    write("vocab/oxford-3000/a1.json", [word]);
    fs.mkdirSync(path.join(root, "lessons", "old"));
    fs.mkdirSync(path.join(root, "lessons", "day-002.json"));
    expect(files()).toContain("lessons/old");
    expect(files()).toContain("lessons/day-002.json");
  });
  it("reports non-json files under vocab/", () => {
    write("lessons/day-001.json", lesson(1));
    write("vocab/oxford-3000/a1.json", [word]);
    write("vocab/oxford-3000/a1.json.bak", "x");
    write("vocab/README.md", "x");
    expect(files()).toContain("a1.json.bak");
    expect(files()).toContain("README.md");
  });
  it("reads files that start with a UTF-8 BOM", () => {
    write("lessons/day-001.json", "\uFEFF" + JSON.stringify(lesson(1)));
    expect(loadLesson(1, root).day).toBe(1);
  });
});

describe("vocab entries validated one by one (S9)", () => {
  it("keeps valid entries, reports the bad one with file, index and id", () => {
    write("vocab/oxford-3000/a1.json", [word, { ...word, id: "v-bad", topics: ["nope"] }, { ...word, id: "v-ok2" }]);
    const r = readContent(root);
    expect(r.vocab[0].items.map((i) => i.id)).toEqual(["v-hello", "v-ok2"]);
    const p = r.problems.find((x) => x.id === "v-bad");
    expect(p?.file).toBe("content/vocab/oxford-3000/a1.json");
    expect(p?.message).toContain("[1].topics[0]");
  });
  it("does not report 'not in the vocab bank' for an id whose own entry failed", () => {
    write("lessons/day-001.json", lesson(1)); // vocab: v-hello
    write("vocab/oxford-3000/a1.json", [{ ...word, th: "no thai" }]);
    const msgs = validateContentDir(root).problems.map((p) => p.message).join("\n");
    expect(msgs).not.toContain("not in the vocab bank");
  });
  it("reports a vocab file that is not an array", () => {
    write("vocab/oxford-3000/a1.json", { id: "x" });
    expect(readContent(root).problems.map((p) => p.message).join()).toMatch(/array/);
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

describe("checkpoints/ folder", () => {
  const checkpoint = (afterDay = 30) => ({
    afterDay, cefr: "preA1", title: bi, estimatedMinutes: 30,
    sections: [{
      skill: "listening", title: bi, weight: 100, reviewDays: [1],
      exercises: [{ id: `c${String(afterDay).padStart(3, "0")}-listen-01`, type: "dictation", instruction: { th: "ก" }, audioText: "Hello." }],
    }],
  });
  const base = () => {
    write("lessons/day-001.json", lesson(1));
    write("vocab/oxford-3000/a1.json", [word]);
  };

  it("a missing checkpoints/ folder is not a problem and gives no checkpoints", () => {
    base();
    const r = readContent(root);
    expect(r.problems).toEqual([]);
    expect(r.checkpoints ?? []).toEqual([]);
  });
  it("an empty checkpoints/ folder is not a problem either", () => {
    base();
    fs.mkdirSync(path.join(root, "checkpoints"));
    expect(readContent(root).problems).toEqual([]);
  });
  it("loads checkpoint-XXX.json files, sorted by name, with the display path", () => {
    base();
    write("checkpoints/checkpoint-060.json", checkpoint(60));
    write("checkpoints/checkpoint-030.json", checkpoint(30));
    const r = readContent(root);
    expect(r.problems).toEqual([]);
    expect(r.checkpoints?.map((c) => [c.file, c.checkpoint.afterDay])).toEqual([
      ["content/checkpoints/checkpoint-030.json", 30], ["content/checkpoints/checkpoint-060.json", 60],
    ]);
  });
  it.each(["checkpoint-30.json", "Checkpoint-030.json", "checkpoint-030.json.bak", "day-030.json", "notes.txt", "checkpoint-030.jsonc"])(
    "reports a wrongly named entry %s", (name) => {
      base();
      write(`checkpoints/${name}`, checkpoint());
      const r = readContent(root);
      expect(r.problems).toEqual([{ file: `content/checkpoints/${name}`, message: expect.stringContaining("checkpoint-XXX.json") }]);
      expect(r.checkpoints ?? []).toEqual([]);
    },
  );
  it("reports a directory inside checkpoints/", () => {
    base();
    fs.mkdirSync(path.join(root, "checkpoints", "checkpoint-030.json"), { recursive: true });
    expect(readContent(root).problems.map((p) => p.message).join("\n")).toContain("checkpoint-XXX.json");
  });
  it("names the file and the JSON path when the schema fails (key typo, afterDay 31, bad JSON)", () => {
    base();
    const typo = checkpoint(30);
    (typo.sections[0] as Record<string, unknown>).wieght = 1;
    write("checkpoints/checkpoint-030.json", typo);
    write("checkpoints/checkpoint-060.json", { ...checkpoint(60), afterDay: 61 });
    write("checkpoints/checkpoint-090.json", "{ nope");
    const out = readContent(root).problems.map((p) => `${p.file}: ${p.message}`).join("\n");
    expect(out).toMatch(/checkpoint-030\.json: sections\[0\].*wieght/);
    expect(out).toMatch(/checkpoint-060\.json: afterDay/);
    expect(out).toMatch(/checkpoint-090\.json: cannot read as JSON/);
  });
  it("loadCheckpoint returns the parsed file, throws ContentError when invalid, and for a missing file", () => {
    write("checkpoints/checkpoint-030.json", checkpoint(30));
    write("checkpoints/checkpoint-060.json", { ...checkpoint(60), weight: 1 });
    expect(loadCheckpoint(30, root).afterDay).toBe(30);
    expect(() => loadCheckpoint(60, root)).toThrow(ContentError);
    expect(() => loadCheckpoint(90, root)).toThrow(/checkpoint-090\.json.*file not found/s);
  });
  it("loadCheckpoint fails clearly when the file's afterDay is not the requested one", () => {
    write("checkpoints/checkpoint-060.json", checkpoint(30));
    expect(() => loadCheckpoint(60, root)).toThrow(ContentError);
    expect(() => loadCheckpoint(60, root)).toThrow(/checkpoint-060\.json.*afterDay 30.*60/s);
  });
  it("loadCheckpoint rejects an afterDay that is not a checkpoint day", () => {
    expect(() => loadCheckpoint(45, root)).toThrow(/45/);
  });
  it("a file whose afterDay disagrees with its name is reported by validateContentDir", () => {
    base();
    write("checkpoints/checkpoint-060.json", checkpoint(30));
    const out = validateContentDir(root).problems.map((p) => p.message).join("\n");
    expect(out).toMatch(/afterDay 30 does not match file name checkpoint-060/);
  });
  it("validateContentDir is clean with the folder missing and with it empty", () => {
    base();
    expect(validateContentDir(root).problems.filter((p) => p.severity !== "warning")).toEqual([]);
    fs.mkdirSync(path.join(root, "checkpoints"));
    expect(validateContentDir(root).problems.filter((p) => p.severity !== "warning")).toEqual([]);
  });
});
