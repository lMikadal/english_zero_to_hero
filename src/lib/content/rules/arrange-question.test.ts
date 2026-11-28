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
const nouns = ["cat", "baby", "friend", "name", "mother", "father", "sister", "teacher", "student", "pen", "box", "people", "parent", "clock", "tomorrow"];
const BANK = [
  ...nouns.map((w) => vocabItem({ id: `v-${w}`, word: w })),
  ...["happy", "big", "small", "nice"].map((w) => vocabItem({ id: `v-${w}`, word: w, pos: "adjective" })),
  vocabItem({ id: "v-maybe", word: "maybe", pos: "adverb" }),
];
const check = (ex: Exercise) => checkArrangeQuestion(buildContext(data([lessonFile(1, [], [ex])], [vocabFile(BANK)])));
/** The question the rule would demand for this answer ("" when it demands nothing). */
const demanded = (answer: string) => /add "([^"]+)" to accept/i.exec(check(arrange(answer))[0]?.message ?? "")?.[1] ?? "";

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
  it("builds a question ONLY when everything before the verb is a pronoun, determiner, name, bank noun/adjective, number, 'and' or a place phrase", () => {
    const cases: [string, string][] = [
      ["I am a student", "Am I a student"], ["There is a cat", "Is there a cat"], ["This is Tom's pen", "Is this Tom's pen"],
      ["It is ten o'clock", "Is it ten o'clock"], ["My mother and father are teachers", "Are my mother and father teachers"],
      ["We can swim", "Can we swim"], ["Mai and I are students", "Are Mai and I students"], ["Mr Smith is a teacher", "Is Mr Smith a teacher"],
      ["The cat in the box is big", "Is the cat in the box big"], ["My big sister is nice", "Is my big sister nice"],
    ];
    for (const [answer, question] of cases) expect(demanded(answer), answer).toBe(question);
  });
  it("builds NOTHING when an adverb, time word or phrase comes before the subject (the question would not be English)", () => {
    for (const s of ["Tomorrow we will go home", "Maybe she is sick", "Usually I am happy", "Of course he is here", "Also he is a doctor", "Really he is ten",
      "Today the cat is big", "Now I am happy", "Always my mother is nice", "In the box the cat is big", "Very big cats are nice"]) {
      expect(check(arrange(s)), s).toEqual([]);
    }
  });
  it("builds nothing for a subject word it does not know (unknown word, preposition with nothing after it)", () => {
    for (const s of ["Zorp is nice", "The cat in is big", "The in cat is big", "My zorp is big"]) expect(check(arrange(s)), s).toEqual([]);
  });
  it("skips contractions (the tile cannot be inverted)", () => {
    expect(check(arrange("She's my friend"))).toEqual([]);
  });
});
