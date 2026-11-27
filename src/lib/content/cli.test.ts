// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentRootFromArgs, runValidate } from "./cli";

let root: string;
beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ezh-cli-")), "content");
  fs.mkdirSync(path.join(root, "lessons"), { recursive: true });
});
afterEach(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

describe("runValidate", () => {
  it("returns 1 for an empty tree (no lessons, no words)", () => {
    const out: string[] = [];
    fs.mkdirSync(path.join(root, "vocab"));
    expect(runValidate(root, (l) => out.push(l))).toBe(1);
    expect(out.join("\n")).toMatch(/no lesson files/);
  });

  it("returns 1 and prints one line per problem, naming the file", () => {
    fs.writeFileSync(path.join(root, "lessons", "day-001.json"), "{ nope");
    fs.writeFileSync(path.join(root, "lessons", "day-002.json"), "{ nope");
    const out: string[] = [];
    expect(runValidate(root, (l) => out.push(l))).toBe(1);
    const lines = out.filter((l) => l.includes("day-00"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("content/lessons/day-001.json");
    expect(out.join("\n")).toMatch(/problem\(s\) found/);
  });
});

describe("runValidate: content rules", () => {
  const write = (name: string, value: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), JSON.stringify(value));
  };
  const word = {
    id: "v-hello", word: "hello", pos: "exclamation", oxford: { list: "3000", level: "A1" }, ipa: { us: "/x/", uk: "/x/" },
    th: "สวัสดี", topics: ["greetings"], examples: [{ en: "Hello, zebra.", th: "สวัสดี" }],
  };
  const lesson = {
    day: 1, phase: 1, week: 1, type: "lesson", cefr: "preA1", title: { en: "Hello", th: "สวัสดี" }, objectives: [{ en: "Hello", th: "สวัสดี" }],
    estimatedMinutes: 20, vocab: ["v-hello"],
    sections: [{ skill: "listening", title: { en: "Hello", th: "สวัสดี" }, exercises: [{ id: "d001-listen-01", type: "dictation", instruction: { th: "ก" }, audioText: "Hello." }] }],
  };

  it("prints the summary line, then the problems grouped under a header naming the rule", () => {
    write("lessons/day-001.json", lesson);
    write("vocab/oxford-3000/a1.json", [word]);
    const out: string[] = [];
    expect(runValidate(root, (l) => out.push(l))).toBe(1);
    expect(out[0]).toBe("lessons: 1 | vocab bank: 1 words | introduced: 1 (100%) | not yet in any lesson: 0");
    const header = out.findIndex((l) => l.includes("== rule taught-words (1)"));
    expect(header).toBeGreaterThan(0);
    expect(out[header + 1]).toMatch(/^ERROR content\/vocab\/oxford-3000\/a1\.json \[v-hello\]: examples\[0\] "Hello, zebra\."/);
    expect(out[out.length - 1]).toBe("content: 1 problem(s) found");
  });
});

describe("runValidate: warnings", () => {
  it("prints a warning (near-clash gloss) without failing and says so in the last line", () => {
    const entry = (id: string, th: string, examples: string[]) => ({
      id, word: id.slice(2), pos: "noun", oxford: { list: "3000", level: "A1" }, ipa: { us: "/x/", uk: "/x/" }, th, topics: ["greetings"],
      examples: examples.map((en) => ({ en, th: "ก" })),
    });
    const ex = (n: number, text: string) => ({ id: `d001-listen-0${n}`, type: "dictation", instruction: { th: "ก" }, audioText: text });
    fs.mkdirSync(path.join(root, "vocab/oxford-3000"), { recursive: true });
    fs.writeFileSync(path.join(root, "vocab/oxford-3000/a1.json"), JSON.stringify([entry("v-cat", "ไม่ (ก)", ["A."]), entry("v-dog", "ไม่ (ข)", ["A."])]));
    fs.writeFileSync(path.join(root, "lessons/day-001.json"), JSON.stringify({
      day: 1, phase: 1, week: 1, type: "lesson", cefr: "preA1", title: { en: "x", th: "ก" }, objectives: [{ en: "x", th: "ก" }],
      estimatedMinutes: 20, vocab: ["v-cat", "v-dog"], sections: [{ skill: "listening", title: { en: "x", th: "ก" }, exercises: [ex(1, "A cat"), ex(2, "A dog")] }],
    }));
    const out: string[] = [];
    expect(runValidate(root, (l) => out.push(l))).toBe(0);
    expect(out.some((l) => l.startsWith("WARN ") && l.includes("near-clash"))).toBe(true);
    expect(out[out.length - 1]).toBe("content: OK (1 warning(s))");
  });
});

describe("contentRootFromArgs (S12)", () => {
  it("defaults to ./content and accepts a directory argument", () => {
    expect(contentRootFromArgs([], "/repo")).toBe("/repo/content");
    expect(contentRootFromArgs(["/tmp/copy/content"], "/repo")).toBe("/tmp/copy/content");
    expect(contentRootFromArgs(["rel/dir"], "/repo")).toBe("/repo/rel/dir");
  });
});
