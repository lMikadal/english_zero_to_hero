// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCheckpoint, getLesson, getTaughtWords, getVocabEntry, getVocabLookup, vocabReader } from "./repo";

const tmp: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true });
});
const realRoot = path.resolve(import.meta.dirname, "../../../content");

describe("getLesson", () => {
  it("loads a real lesson by day", () => {
    const l = getLesson(1);
    expect(l?.day).toBe(1);
    expect(l?.sections.length).toBeGreaterThan(0);
  });
  it("returns null for a day without a file and for days out of range", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    tmp.push(empty);
    expect(getLesson(1, empty)).toBeNull(); // a day without a file (never a real day number: content/ grows to 365)
    expect(getLesson(0)).toBeNull();
    expect(getLesson(366)).toBeNull();
    expect(getLesson(1.5)).toBeNull();
  });
  it("a missing file is null even when the lessons directory itself is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    tmp.push(root);
    expect(getLesson(1, root)).toBeNull();
  });
  it("throws for a file that exists but is invalid (never serves broken content)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    tmp.push(root);
    fs.mkdirSync(path.join(root, "lessons"));
    fs.writeFileSync(path.join(root, "lessons", "day-001.json"), "{}");
    expect(() => getLesson(1, root)).toThrow();
  });
});

describe("getVocabLookup", () => {
  it("returns word, th and ipa for the ids that exist and skips unknown ids", () => {
    const v = getVocabLookup(["v-cat", "v-nice", "v-does-not-exist"]);
    expect(Object.keys(v).sort()).toEqual(["v-cat", "v-nice"]);
    expect(v["v-cat"]).toEqual({ word: "cat", th: expect.stringMatching(/[฀-๿]/), ipa: { us: expect.any(String), uk: expect.any(String) } });
  });
  it("returns an empty lookup for no ids", () => expect(getVocabLookup([])).toEqual({}));
  it("does not depend on lessons being valid: a broken lesson file does not break it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    tmp.push(root);
    fs.cpSync(path.join(realRoot, "vocab"), path.join(root, "vocab"), { recursive: true });
    fs.mkdirSync(path.join(root, "lessons"));
    fs.writeFileSync(path.join(root, "lessons", "day-001.json"), "not json");
    expect(Object.keys(getVocabLookup(["v-cat"], root))).toEqual(["v-cat"]);
  });
  it("skips an invalid vocab entry instead of throwing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    tmp.push(root);
    fs.mkdirSync(path.join(root, "vocab"));
    const good = JSON.parse(fs.readFileSync(path.join(realRoot, "vocab/oxford-3000/a1.json"), "utf8")).find((x: { id: string }) => x.id === "v-cat");
    fs.writeFileSync(path.join(root, "vocab", "x.json"), JSON.stringify([good, { id: "v-bad" }]));
    expect(Object.keys(getVocabLookup(["v-cat", "v-bad"], root))).toEqual(["v-cat"]);
  });
});

describe("getTaughtWords", () => {
  it("returns every word taught on or before the day (id -> word)", () => {
    const d1 = getTaughtWords(1);
    expect(d1.get("v-hello")).toBe("hello");
    expect(d1.has("v-where")).toBe(false); // taught on day 3
    const d3 = getTaughtWords(3);
    expect(d3.get("v-where")).toBe("where");
    expect(d3.get("v-bed")).toBe("bed"); // day 2
    expect(d3.has("v-goodbye")).toBe(false); // day 4
  });
  it("is cumulative on review days that teach nothing", () => {
    expect(getTaughtWords(7).size).toBe(getTaughtWords(5).size);
    expect(getTaughtWords(7).get("v-please")).toBe("please");
  });
  it("is empty for a day without lessons and for days out of range", () => {
    expect(getTaughtWords(0).size).toBe(0);
    expect(getTaughtWords(1000).size).toBe(getTaughtWords(365).size);
  });
  it("skips lesson files that are missing or broken instead of failing every attempt", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    tmp.push(root);
    fs.cpSync(realRoot, root, { recursive: true });
    fs.writeFileSync(path.join(root, "lessons", "day-002.json"), "not json");
    const w = getTaughtWords(3, root);
    expect(w.has("v-hello")).toBe(true);
    expect(w.has("v-where")).toBe(true);
    expect(w.has("v-bed")).toBe(false);
  });
});

describe("getVocabEntry (what a review card shows)", () => {
  it("returns the whole entry (word, ipa for both accents, Thai, examples) or null", () => {
    const v = getVocabEntry("v-hello");
    expect(v?.word).toBe("hello");
    expect(v?.ipa.us.length).toBeGreaterThan(0);
    expect(v?.ipa.uk.length).toBeGreaterThan(0);
    expect(v?.examples[0].en.length).toBeGreaterThan(0);
    expect(getVocabEntry("v-does-not-exist")).toBeNull();
  });
});

describe("vocabReader (one index for many lookups)", () => {
  /** How many times the vocab tree was listed from its top directory. */
  const spyTreeReads = () => {
    const spy = vi.spyOn(fs, "readdirSync");
    return () => spy.mock.calls.filter(([dir]) => String(dir) === path.join(realRoot, "vocab")).length;
  };
  it("reads the vocabulary tree once for any number of lookups (outside production getVocabEntry rebuilds it every call)", () => {
    const reads = spyTreeReads();
    const get = vocabReader(realRoot);
    for (let i = 0; i < 500; i++) get("v-hello");
    expect(get("v-hello")?.word).toBe("hello");
    expect(get("v-does-not-exist")).toBeNull();
    expect(reads()).toBe(1);
  });
  it("single-entry behaviour of getVocabEntry is unchanged", () => {
    expect(vocabReader(realRoot)("v-cat")).toEqual(getVocabEntry("v-cat", realRoot));
  });
});

describe("getTaughtWords is in teaching order (day, then position in lesson.vocab)", () => {
  it("days 1 and 2: the five day 1 words in lesson order, then day 2's", () => {
    const ids = [...getTaughtWords(2).keys()];
    expect(ids.slice(0, 5)).toEqual([...(getLesson(1)?.vocab ?? [])]);
    expect(ids.slice(5)).toEqual([...(getLesson(2)?.vocab ?? [])]);
  });
});

describe("getCheckpoint", () => {
  const mk = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    tmp.push(root);
    return root;
  };
  const bi = { en: "Hello", th: "สวัสดี" };
  const valid = {
    afterDay: 30, cefr: "preA1", title: bi, estimatedMinutes: 30,
    sections: [{ skill: "listening", title: bi, weight: 100, reviewDays: [1],
      exercises: [{ id: "c030-listen-01", type: "dictation", instruction: { th: "ก" }, audioText: "Hello." }] }],
  };
  it("returns null when there is no file, even when the folder is missing (the repo has none yet)", () => {
    expect(getCheckpoint(30, mk())).toBeNull();
    expect(getCheckpoint(30)).toBeNull(); // the real content/ has no checkpoints/ in this PR
  });
  it("returns null for days that are not checkpoint days", () => {
    expect(getCheckpoint(0)).toBeNull();
    expect(getCheckpoint(31)).toBeNull();
    expect(getCheckpoint(390)).toBeNull();
    expect(getCheckpoint(30.5)).toBeNull();
  });
  it("returns the parsed checkpoint", () => {
    const root = mk();
    fs.mkdirSync(path.join(root, "checkpoints"));
    fs.writeFileSync(path.join(root, "checkpoints", "checkpoint-030.json"), JSON.stringify(valid));
    expect(getCheckpoint(30, root)?.sections[0].weight).toBe(100);
  });
  it("throws for a file that exists but is invalid (never serves a broken test)", () => {
    const root = mk();
    fs.mkdirSync(path.join(root, "checkpoints"));
    fs.writeFileSync(path.join(root, "checkpoints", "checkpoint-030.json"), "{}");
    expect(() => getCheckpoint(30, root)).toThrow();
  });
});
