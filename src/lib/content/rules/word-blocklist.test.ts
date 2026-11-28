// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { BLOCKED_WORDS } from "./allowlists";
import { buildContext } from "./context";
import { checkWordBlocklist } from "./word-blocklist";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const pair = (a: string, b: string): Exercise => ({ id: exId(1, "pron"), type: "minimal_pair", instruction, pairs: [{ a, b, answer: "a" }] });
const say = (text: string): Exercise => ({ id: exId(1, "speak"), type: "repeat_after_me", instruction, text });
const run = (ex: Exercise, items = [vocabItem({ id: "v-cat" })]) => checkWordBlocklist(buildContext(data([lessonFile(1, [], [ex])], [vocabFile(items)])));

describe("word-blocklist: words unsuitable for a beginner course (error)", () => {
  it("is a short explicit list that starts with hell and damn", () => {
    expect(BLOCKED_WORDS).toEqual(expect.arrayContaining(["hell", "damn"]));
    expect(BLOCKED_WORDS.length).toBeLessThan(20);
    for (const w of BLOCKED_WORDS) expect(w).toMatch(/^[a-z]+$/);
  });
  it("flags 'hell' as a minimal-pair word (the incident), naming exercise and field", () => {
    const out = run(pair("help", "hell"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "word-blocklist", file: "content/lessons/day-001.json", id: "d001-pron-01" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain('"hell"');
    expect(out[0].message).toContain("pairs[0].b");
    expect(out[0].message).toContain("BLOCKED_WORDS");
  });
  it("flags it in a sentence, any case, possessive too", () => {
    expect(run(say("What the Hell is that?"))).toHaveLength(1);
    expect(run(say("Oh, damn it."))).toHaveLength(1);
    expect(run(say("Hell's door."))).toHaveLength(1);
  });
  it("matches whole words only: hello, shell, Michelle, hellish, shelled are fine", () => {
    for (const w of ["hello", "shell", "Michelle", "Hello, Ann!", "A shell on the sand.", "helmet", "shelf"]) expect(run(say(w)), w).toEqual([]);
    expect(run(pair("shell", "sell"))).toEqual([]);
  });
  it("also reads the vocab bank (headwords and examples)", () => {
    const bad = { ...vocabItem({ id: "v-bad", word: "bad" }), examples: [{ en: "What the hell.", th: "ก" }] };
    const out = run(say("Hello."), [bad]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("v-bad");
  });
});
