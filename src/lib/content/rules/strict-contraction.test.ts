// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkStrictContraction } from "./strict-contraction";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const tr = (accept: string[], strict?: boolean): Exercise => ({ id: exId(64, "write"), type: "translate_th_en", instruction, th: "ก", accept, ...(strict === undefined ? {} : { strict }) } as Exercise);
const run = (ex: Exercise) => checkStrictContraction(buildContext(data([lessonFile(64, [], [ex])], [vocabFile([vocabItem({ id: "v-cat" })])])));

describe("strict-contraction (warning): strict turns contraction folding off", () => {
  it("warns for a strict translation with 'Name is' / 'I am' / 'is not' and no contracted form listed", () => {
    for (const a of [["Leo is playing the guitar"], ["I am waiting at the station"], ["Leo is not using the computer"], ["She is reading"]]) {
      const out = run(tr(a, true));
      expect(out, a[0]).toHaveLength(1);
      expect(out[0]).toMatchObject({ rule: "strict-contraction", severity: "warning" });
    }
  });
  it("is quiet when every such answer has a contraction listed, when not strict, or without be", () => {
    expect(run(tr(["Leo is playing the guitar", "Leo's playing the guitar"], true))).toEqual([]);
    expect(run(tr(["I am waiting", "I'm waiting"], true))).toEqual([]);
    expect(run(tr(["Leo is not using it", "Leo isn't using it"], true))).toEqual([]);
    expect(run(tr(["Leo is playing the guitar"]))).toEqual([]);
    expect(run(tr(["Leo is playing the guitar"], false))).toEqual([]);
    expect(run(tr(["Rose has a cake"], true))).toEqual([]);
  });
});
