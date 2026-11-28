import { describe, expect, it } from "vitest";
import { compareStats, detectWeaknesses, groupStats, isRecovered, isWeak, parseWeaknessTag, weaknessTag } from "./weakness";
import { attempt, daysAgo, NOW } from "./test-utils";

/** n attempts of the same exercise type, `wrong` of them incorrect, all at the same time. */
const batch = (exerciseType: string, n: number, wrong: number, over = {}) =>
  Array.from({ length: n }, (_, i) => attempt({ exerciseType, correct: i >= wrong, ...over }));

const stat = (attempts: ReturnType<typeof batch>, angle: "phoneme" | "vocab" | "exerciseType" | "skill", key: string) =>
  groupStats(attempts, NOW).find((s) => s.angle === angle && s.key === key);

describe("thresholds", () => {
  it("is weak at exactly 30% and not just under", () => {
    expect(isWeak(0.3)).toBe(true);
    expect(isWeak(0.2999)).toBe(false);
  });

  it("is recovered only below 15%", () => {
    expect(isRecovered(0.1499)).toBe(true);
    expect(isRecovered(0.15)).toBe(false);
  });
});

describe("groupStats", () => {
  it("returns nothing for no attempts", () => {
    expect(groupStats([], NOW)).toEqual([]);
  });

  it("computes the error rate per exercise type and skill", () => {
    const s = stat(batch("dictation", 10, 3), "exerciseType", "dictation");
    expect(s?.errorRate).toBeCloseTo(0.3, 10);
    expect(s?.attempts).toBe(10);
    expect(stat(batch("dictation", 10, 3), "skill", "reading")?.attempts).toBe(10);
  });

  it("flags exactly 30% weak despite float rounding, and 29% not", () => {
    expect(stat(batch("a", 10, 3), "exerciseType", "a")?.weak).toBe(true);
    expect(stat(batch("a", 100, 29), "exerciseType", "a")?.weak).toBe(false);
    expect(stat(batch("a", 100, 30), "exerciseType", "a")?.weak).toBe(true);
  });

  it("needs at least 5 attempts: 4 wrong of 4 is not weak, 5 wrong of 5 is", () => {
    const four = stat(batch("a", 4, 4), "exerciseType", "a");
    expect(four?.weak).toBe(false);
    expect(four?.recovered).toBe(false);
    expect(stat(batch("a", 5, 5), "exerciseType", "a")?.weak).toBe(true);
  });

  it("marks recovered below 15% with enough attempts, not in the 15-30% band", () => {
    expect(stat(batch("a", 20, 2), "exerciseType", "a")?.recovered).toBe(true); // 10%
    expect(stat(batch("a", 20, 3), "exerciseType", "a")?.recovered).toBe(false); // exactly 15%
    const mid = stat(batch("a", 10, 2), "exerciseType", "a"); // 20%
    expect(mid?.weak).toBe(false);
    expect(mid?.recovered).toBe(false);
    expect(stat(batch("a", 4, 0), "exerciseType", "a")?.recovered).toBe(false); // too few
  });

  it("weights attempts with a 7-day half-life", () => {
    // 5 right now, 5 wrong exactly 7 days ago (weight 0.5): 2.5 / 7.5 = 1/3
    const a = [...batch("a", 5, 0), ...batch("a", 5, 5, { createdAt: daysAgo(7) })];
    expect(stat(a, "exerciseType", "a")?.errorRate).toBeCloseTo(1 / 3, 10);
    // 14 days ago is the oldest allowed: weight 0.25
    const b = [...batch("a", 5, 0), ...batch("a", 5, 5, { createdAt: daysAgo(14) })];
    expect(stat(b, "exerciseType", "a")?.errorRate).toBeCloseTo(1.25 / 6.25, 10);
  });

  it("ignores attempts older than 14 days and attempts in the future", () => {
    const a = [
      ...batch("a", 5, 0),
      ...batch("a", 5, 5, { createdAt: new Date(daysAgo(14).getTime() - 1) }),
      ...batch("a", 5, 5, { createdAt: new Date(NOW.getTime() + 1) }),
    ];
    const s = stat(a, "exerciseType", "a");
    expect(s?.attempts).toBe(5);
    expect(s?.errorRate).toBe(0);
  });

  it("counts only lesson and checkpoint attempts, so drills and retests cannot hide or inflate a weakness", () => {
    const lesson = batch("a", 5, 5); // 100% wrong
    const drills = batch("a", 20, 0, { source: "drill" });
    const retests = batch("a", 20, 0, { source: "retest" });
    const s = stat([...lesson, ...drills, ...retests], "exerciseType", "a");
    expect(s?.attempts).toBe(5);
    expect(s?.errorRate).toBe(1);
    expect(stat(batch("a", 5, 5, { source: "checkpoint" }), "exerciseType", "a")?.weak).toBe(true);
    expect(stat(batch("a", 20, 20, { source: "drill" }), "exerciseType", "a")).toBeUndefined();
  });

  it("groups by every phoneme and vocab tag, ignoring other tags", () => {
    const a = batch("a", 5, 5, { tags: ["phoneme:ae", "phoneme:th", "vocab:v-cat", "grammar:x"] });
    expect(stat(a, "phoneme", "phoneme:ae")?.attempts).toBe(5);
    expect(stat(a, "phoneme", "phoneme:th")?.attempts).toBe(5);
    expect(stat(a, "vocab", "vocab:v-cat")?.attempts).toBe(5);
    expect(groupStats(a, NOW).filter((s) => s.angle === "phoneme" || s.angle === "vocab")).toHaveLength(3);
  });
});

describe("detectWeaknesses", () => {
  it("returns empty lists per angle for empty input", () => {
    expect(detectWeaknesses([], NOW)).toEqual({ phoneme: [], vocab: [], exerciseType: [], skill: [] });
  });

  it("keeps only weak groups, sorted by error rate descending", () => {
    const a = [...batch("fine", 10, 1), ...batch("bad", 10, 4), ...batch("worst", 10, 8)];
    const r = detectWeaknesses(a, NOW);
    expect(r.exerciseType.map((s) => s.key)).toEqual(["worst", "bad"]);
  });

  it("shows at most 5 per angle", () => {
    const a = Array.from({ length: 7 }, (_, i) => batch(`t${i}`, 10, 4 + (i % 3))).flat();
    expect(detectWeaknesses(a, NOW).exerciseType).toHaveLength(5);
  });

  it("breaks ties deterministically by key, whatever the input order", () => {
    const groups = ["c", "a", "b"].map((k) => batch(k, 10, 5));
    const forward = detectWeaknesses(groups.flat(), NOW).exerciseType.map((s) => s.key);
    const reversed = detectWeaknesses([...groups].reverse().flat(), NOW).exerciseType.map((s) => s.key);
    expect(forward).toEqual(["a", "b", "c"]);
    expect(reversed).toEqual(["a", "b", "c"]);
  });

  it("reports the skill angle", () => {
    const a = batch("x", 10, 6, { skill: "listening" });
    expect(detectWeaknesses(a, NOW).skill.map((s) => s.key)).toEqual(["listening"]);
  });
});

describe("first attempt only", () => {
  it("ignores retries (attemptNo 2) entirely", () => {
    const first = batch("a", 5, 5); // 5 first tries, all wrong
    const retries = batch("a", 20, 0, { attemptNo: 2 }); // all right on retry
    const s = stat([...first, ...retries], "exerciseType", "a");
    expect(s?.attempts).toBe(5);
    expect(s?.errorRate).toBe(1);
    expect(stat(batch("a", 20, 20, { attemptNo: 2 }), "exerciseType", "a")).toBeUndefined();
  });
});

describe("ungraded attempts (score null)", () => {
  const ungraded = (n: number, over = {}) => batch("speak_answer", n, 0, { score: null, skill: "speaking", ...over });

  it("never make a group weak or recovered, even with many attempts that are all wrong", () => {
    const a = batch("speak_answer", 10, 10, { score: null, skill: "speaking" });
    expect(groupStats(a, NOW)).toEqual([]);
    expect(detectWeaknesses(a, NOW).skill).toEqual([]);
  });

  it("do not count towards the 5-attempt minimum", () => {
    // 3 graded wrong + 10 ungraded in the same skill: only 3 count
    const a = [...batch("x", 3, 3, { skill: "speaking" }), ...ungraded(10, { correct: false })];
    const s = stat(a, "skill", "speaking");
    expect(s?.attempts).toBe(3);
    expect(s?.weak).toBe(false);
  });

  it("neither raise nor lower another group's rate", () => {
    const graded = batch("x", 10, 3, { skill: "speaking" }); // 30%
    const withWrong = [...graded, ...batch("y", 20, 20, { score: null, skill: "speaking" })];
    const withRight = [...graded, ...ungraded(20)];
    expect(stat(withWrong, "skill", "speaking")?.errorRate).toBeCloseTo(0.3, 10);
    expect(stat(withRight, "skill", "speaking")?.errorRate).toBeCloseTo(0.3, 10);
    expect(stat(withRight, "skill", "speaking")?.attempts).toBe(10);
  });

  it("also skip tags of ungraded attempts for the phoneme and vocab angles", () => {
    const a = batch("x", 5, 5, { score: null, tags: ["phoneme:ae", "vocab:v-cat"] });
    expect(groupStats(a, NOW)).toEqual([]);
  });
});

describe("partial scores", () => {
  it("weights the error as 1 - score, not the all-or-nothing correct flag", () => {
    // 10 attempts each scoring 0.7 (not fully correct): error 0.3 -> weak
    const a = batch("a", 10, 10, { score: 0.7 });
    expect(stat(a, "exerciseType", "a")?.errorRate).toBeCloseTo(0.3, 10);
    expect(stat(a, "exerciseType", "a")?.weak).toBe(true);
    // 0.71 -> 0.29 -> not weak
    expect(stat(batch("a", 10, 10, { score: 0.71 }), "exerciseType", "a")?.weak).toBe(false);
  });

  it("ignores the correct flag when a score exists", () => {
    const a = batch("a", 10, 0, { score: 0.5 }); // correct = true but half the points
    expect(stat(a, "exerciseType", "a")?.errorRate).toBeCloseTo(0.5, 10);
  });

  it("averages 1 - score with the half-life weights", () => {
    // 5 now at score 1, 5 seven days ago at score 0.5: (5*0.5*0.5) / 7.5
    const a = [...batch("a", 5, 0), ...batch("a", 5, 0, { score: 0.5, createdAt: daysAgo(7) })];
    expect(stat(a, "exerciseType", "a")?.errorRate).toBeCloseTo(1.25 / 7.5, 10);
  });
});

describe("weakness tags", () => {
  it("builds the tag a drill or retest attempt carries", () => {
    expect(weaknessTag({ angle: "phoneme", key: "phoneme:ae" })).toBe("weakness:phoneme:ae");
    expect(weaknessTag({ angle: "vocab", key: "vocab:v-cat" })).toBe("weakness:vocab:v-cat");
    expect(weaknessTag({ angle: "skill", key: "listening" })).toBe("weakness:skill:listening");
    expect(weaknessTag({ angle: "exerciseType", key: "dictation" })).toBe("weakness:exerciseType:dictation");
  });

  it("parses it back, and rejects other tags", () => {
    for (const w of [
      { angle: "phoneme", key: "phoneme:ae" },
      { angle: "vocab", key: "vocab:v-cat" },
      { angle: "skill", key: "listening" },
      { angle: "exerciseType", key: "dictation" },
    ] as const) {
      expect(parseWeaknessTag(weaknessTag(w))).toEqual(w);
    }
    expect(parseWeaknessTag("phoneme:ae")).toBeNull();
    expect(parseWeaknessTag("weakness:unknown:x")).toBeNull();
    expect(parseWeaknessTag("weakness:skill:")).toBeNull();
  });

  it("are never treated as phoneme or vocab groups by detection", () => {
    const a = batch("a", 5, 5, { tags: ["weakness:phoneme:ae", "weakness:vocab:v-cat"] });
    expect(groupStats(a, NOW).filter((s) => s.angle === "phoneme" || s.angle === "vocab")).toEqual([]);
  });
});

describe("score hygiene", () => {
  it("clamps scores to 0..1", () => {
    expect(stat(batch("a", 5, 0, { score: 7 }), "exerciseType", "a")?.errorRate).toBe(0);
    expect(stat(batch("a", 5, 5, { score: -3 }), "exerciseType", "a")?.errorRate).toBe(1);
  });

  it("treats non-finite scores as ungraded", () => {
    expect(groupStats(batch("a", 6, 6, { score: Number.NaN }), NOW)).toEqual([]);
    expect(groupStats(batch("a", 6, 6, { score: Number.POSITIVE_INFINITY }), NOW)).toEqual([]);
  });
});

describe("compareStats", () => {
  const s = (key: string, errorRate: number) => ({ angle: "skill" as const, key, attempts: 5, errorRate, weak: true, recovered: false });

  it("treats error rates within a tiny epsilon as equal and falls back to the key", () => {
    expect([s("b", 0.5), s("a", 0.5 + 1e-12)].sort(compareStats).map((x) => x.key)).toEqual(["a", "b"]);
    expect([s("a", 0.5), s("b", 0.5 + 1e-12)].sort(compareStats).map((x) => x.key)).toEqual(["a", "b"]);
    expect([s("a", 0.5), s("b", 0.51)].sort(compareStats).map((x) => x.key)).toEqual(["b", "a"]);
  });
});

describe("practice attempts are not evidence (U4)", () => {
  it("adding all-wrong practice attempts leaves groupStats and detectWeaknesses unchanged", () => {
    const base = [...batch("dictation", 10, 2, { tags: ["phoneme:ae"] }), ...batch("cloze", 6, 0)];
    const practice = batch("dictation", 30, 30, { source: "practice", tags: ["phoneme:ae"], skill: "listening" });
    expect(groupStats([...base, ...practice], NOW)).toEqual(groupStats(base, NOW));
    expect(detectWeaknesses([...base, ...practice], NOW)).toEqual(detectWeaknesses(base, NOW));
  });
});

describe("checkpoint retakes are not evidence (D11)", () => {
  it("adding all-wrong checkpoint_retake attempts leaves groupStats and detectWeaknesses unchanged", () => {
    const base = [...batch("dictation", 10, 2, { tags: ["phoneme:ae"] }), ...batch("cloze", 6, 0), ...batch("dictation", 6, 1, { source: "checkpoint", tags: ["phoneme:ae"] })];
    const retake = batch("dictation", 30, 30, { source: "checkpoint_retake", tags: ["phoneme:ae"], skill: "listening" });
    expect(groupStats([...base, ...retake], NOW)).toEqual(groupStats(base, NOW));
    expect(detectWeaknesses([...base, ...retake], NOW)).toEqual(detectWeaknesses(base, NOW));
  });

  it("the first answer of a checkpoint (source checkpoint) still counts", () => {
    const wrong = batch("dictation", 10, 10, { source: "checkpoint", tags: ["phoneme:ae"], skill: "listening" });
    expect(groupStats(wrong, NOW).length).toBeGreaterThan(0);
  });
});
