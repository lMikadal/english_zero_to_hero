// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkTryOn } from "./try-on";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const say = (text: string): Exercise => ({ id: exId(65, "speak"), type: "repeat_after_me", instruction, text });
const tr = (accept: string[]): Exercise => ({ id: exId(65, "write"), type: "translate_th_en", instruction, th: "ก", accept } as Exercise);
const run = (ex: Exercise, examples: string[] = ["I do."]) => checkTryOn(buildContext(data([lessonFile(65, ["v-try"], [ex])], [vocabFile([vocabItem({ id: "v-try", word: "try", pos: "verb", examples })])])));

describe("try-on (error): you try ON clothes, you try food", () => {
  it("flags try / tries / trying / tried + a clothing word without on", () => {
    for (const t of ["Nan tries a red skirt.", "Nan is trying the red skirt.", "I tried a pair of black shoes.", "Try this coat, please.", "Leo is trying a green shirt."]) {
      const out = run(say(t));
      expect(out, t).toHaveLength(1);
      expect(out[0]).toMatchObject({ rule: "try-on", id: "d065-speak-01" });
      expect(out[0].message).toContain("try on");
    }
  });
  it("is quiet with on (before or after the clothes), and for food or things", () => {
    for (const t of ["Nan tries on a red skirt.", "Nan is trying a red skirt on.", "Try on this coat.", "Dan is trying the soup.", "Leo is trying a guitar.", "I try a pair of shoes on."]) expect(run(say(t)), t).toEqual([]);
  });
  it("reads every accepted answer, not only the first", () => {
    expect(run(tr(["Nan is trying on a red skirt", "Nan is trying a red skirt"]))).toHaveLength(1);
  });
  it("reads the examples of a vocab entry", () => {
    expect(run(say("Hello."), ["Nan tries a red skirt."])).toHaveLength(1);
  });
});
