// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { PHRASE_LINTS, checkPhraseLint } from "./phrase-lint";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const say = (text: string): Exercise => ({ id: exId(1, "speak"), type: "repeat_after_me", instruction, text });
const run = (...texts: string[]) => checkPhraseLint(buildContext(data([lessonFile(1, [], texts.map(say).map((e, i) => ({ ...e, id: exId(1, "speak", i + 1) })))], [vocabFile([vocabItem({ id: "v-cat" })])])));

describe("phrase-lint (warnings): phrasings an A1 lesson should not teach", () => {
  it.each([
    ["He likes some tea.", "likes some"], ["I like some coffee.", "like some"], ["I order a coffee, please.", "I order"],
    ["Do you not like tea?", "Do you not"], ["How many cats has my sister?", "How many"], ["How many books has the teacher?", "How many"],
  ])("flags %s", (text, hint) => {
    const out = run(text);
    expect(out, text).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "phrase-lint", severity: "warning", file: "content/lessons/day-001.json", id: "d001-speak-01" });
    expect(out[0].message).toContain(hint);
    expect(out[0].message).toContain(`"${text}"`);
  });
  it("is quiet on natural English with the same words", () => {
    expect(run("Would you like some tea?", "I would like some tea, please.", "I'd like some tea.", "She would like some water.", "I like tea.", "I order tea.",
      "Do you like tea?", "Don't you like tea?", "How many cats does my sister have?", "How many cats have you?", "Can I order a coffee, please?")).toEqual([]);
  });
  it("one warning per pattern per exercise, and the table is explicit", () => {
    expect(run("I like some tea. He likes some water.")).toHaveLength(1);
    expect(PHRASE_LINTS.map((p) => p.id)).toEqual(["like-some", "i-order-please", "do-you-not", "how-many-has"]);
  });
});
