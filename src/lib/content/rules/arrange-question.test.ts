// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkArrangeQuestion } from "./arrange-question";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const arrange = (answer: string, accept?: string[], extra: Record<string, unknown> = {}, tiles?: string[]): Exercise =>
  ({
    id: exId(1, "write"), type: "arrange_words", instruction, answer,
    words: tiles ?? answer.replace(/[.?!]$/, "").split(" "), ...(accept ? { accept } : {}), ...extra,
  }) as Exercise;
const check = (ex: Exercise) => checkArrangeQuestion(buildContext(data([lessonFile(1, [], [ex])], [vocabFile([vocabItem({ id: "v-cat" })])])));

describe("arrange-question: a statement 'Subject is/are/am ...' must also accept the yes/no question built from the same tiles", () => {
  it("flags a statement whose question order is not accepted, naming the exercise, the statement and the exact sentence to add", () => {
    const out = check(arrange("My baby is very happy"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "arrange-question", file: "content/lessons/day-001.json", id: "d001-write-01" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain('"My baby is very happy"');
    expect(out[0].message).toContain('"Is my baby very happy"');
    expect(out[0].message).toContain("accept");
    expect(out[0].message).toContain("statementOnly");
  });
  it("builds the question for are, am and a modal; keeps I and names capitalised", () => {
    expect(check(arrange("You are my friend"))[0].message).toContain('"Are you my friend"');
    expect(check(arrange("I am from Thailand"))[0].message).toContain('"Am I from Thailand"');
    expect(check(arrange("Sam is my friend"))[0].message).toContain('"Is Sam my friend"');
    expect(check(arrange("I can swim"))[0].message).toContain('"Can I swim"');
    expect(check(arrange("These are my parents"))[0].message).toContain('"Are these my parents"');
    expect(check(arrange("There is a cat"))[0].message).toContain('"Is there a cat"');
  });
  it("accepts when the question is in accept (case, punctuation and contraction folding as in grading)", () => {
    expect(check(arrange("This is my sister", ["Is this my sister"]))).toEqual([]);
    expect(check(arrange("This is my sister", ["is THIS my sister?"]))).toEqual([]);
  });
  it("is not satisfied by an unrelated accepted sentence", () => {
    expect(check(arrange("This is my sister", ["My sister is this"]))).toHaveLength(1);
  });
  it("statementOnly: true opts out", () => {
    expect(check(arrange("My baby is very happy", undefined, { statementOnly: true }))).toEqual([]);
  });
  it("does nothing when the question cannot be built from the tiles (a distractor-free exercise whose tiles differ)", () => {
    expect(check(arrange("He is a teacher", undefined, {}, ["He", "is", "a", "doctor"]))).toEqual([]);
  });
  it("skips sentences that are not a plain statement: wh-questions, negatives, yes/no answers, commas, two clauses, 'here', imperatives", () => {
    for (const s of ["How are you", "Where is my pen", "I am not a doctor", "No, it is not a door", "Yes, I am", "Here is my pen",
      "Please be quiet", "He is tall and she is short", "I am Ann and I like cats", "We live in a small house", "Is this my pen", "My name is Sam."]) {
      const out = check(arrange(s));
      // "My name is Sam." is a plain statement (the full stop is ignored); everything else is skipped
      expect(out.length, s).toBe(s === "My name is Sam." ? 1 : 0);
    }
  });
  it("skips contractions (the tile cannot be inverted)", () => {
    expect(check(arrange("She's my friend"))).toEqual([]);
  });
});
