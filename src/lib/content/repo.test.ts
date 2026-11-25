// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getLesson, getVocabLookup } from "./repo";

const tmp: string[] = [];
afterEach(() => {
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
    expect(getLesson(365)).toBeNull();
    expect(getLesson(0)).toBeNull();
    expect(getLesson(366)).toBeNull();
    expect(getLesson(1.5)).toBeNull();
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
