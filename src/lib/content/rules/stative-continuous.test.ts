// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkStativeContinuous } from "./stative-continuous";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const say = (text: string): Exercise => ({ id: exId(65, "speak"), type: "repeat_after_me", instruction, text });
const run = (ex: Exercise) => checkStativeContinuous(buildContext(data([lessonFile(65, [], [ex])], [vocabFile([vocabItem({ id: "v-cat" })])])));

describe("stative-continuous (warning): find, know, like, want, need, love, cost are not used in the continuous", () => {
  it("warns for am / is / are + the -ing form of those verbs", () => {
    for (const t of ["He is finding a picture.", "We are finding the key.", "I am liking rice.", "She is wanting a coat.", "I'm knowing the answer.", "It is costing ten baht.", "They are not needing a map.", "Leo is loving ice cream."]) {
      const out = run(say(t));
      expect(out, t).toHaveLength(1);
      expect(out[0]).toMatchObject({ rule: "stative-continuous", severity: "warning" });
    }
  });
  it("is quiet for the simple form and for other continuous verbs", () => {
    for (const t of ["Leo always finds his key.", "I like rice.", "Leo is reading.", "Rose is making a cake.", "She wants a coat.", "The finding is good."]) expect(run(say(t)), t).toEqual([]);
  });
});
