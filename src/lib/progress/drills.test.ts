import { describe, expect, it } from "vitest";
import { matchesWeakness, recommendDrills, sessionResults, weakPoints, weaknessStatus, type WeakPoint } from "./drills";
import { attempt, daysAgo, NOW } from "./test-utils";
import { groupStats, weaknessTag, type Weakness } from "./weakness";
import type { AttemptLike } from "./types";

const TZ = "Asia/Bangkok";
const W = { angle: "phoneme", key: "phoneme:ae" } as const;
const TAG = weaknessTag(W);

/** A drill/retest session of `total` graded attempts, `right` correct, finishing at `at`, tagged for `w`. */
function session(id: string, source: "drill" | "retest", right: number, total: number, at: Date, tag = TAG): AttemptLike[] {
  return Array.from({ length: total }, (_, i) =>
    attempt({
      source,
      sessionId: id,
      tags: [tag, "phoneme:ae"],
      correct: i < right,
      createdAt: new Date(at.getTime() - (total - 1 - i) * 1000),
    }),
  );
}

/** Lesson attempts on phoneme:ae, the last `wrong` of `total` wrong, one second apart, ending at `at`. */
const lesson = (wrong: number, total: number, at: Date, over: Partial<AttemptLike> = {}): AttemptLike[] =>
  Array.from({ length: total }, (_, i) =>
    attempt({ tags: ["phoneme:ae"], correct: i < total - wrong, createdAt: new Date(at.getTime() - (total - 1 - i) * 1000), ...over }),
  );

const status = (attempts: AttemptLike[], w: Weakness = W, now = NOW) => weaknessStatus(attempts, w, now, TZ).status;

describe("matchesWeakness", () => {
  it("matches lesson and checkpoint attempts by phoneme/vocab tag, exercise type or skill", () => {
    expect(matchesWeakness(attempt({ tags: ["phoneme:ae"] }), W)).toBe(true);
    expect(matchesWeakness(attempt({ tags: ["phoneme:th"] }), W)).toBe(false);
    expect(matchesWeakness(attempt({ source: "checkpoint", tags: ["phoneme:ae"] }), W)).toBe(true);
    expect(matchesWeakness(attempt({ exerciseType: "dictation" }), { angle: "exerciseType", key: "dictation" })).toBe(true);
    expect(matchesWeakness(attempt({ skill: "writing" }), { angle: "skill", key: "writing" })).toBe(true);
    expect(matchesWeakness(attempt({ skill: "writing" }), { angle: "skill", key: "reading" })).toBe(false);
  });

  it("matches drill and retest attempts ONLY by the weakness tag", () => {
    const listening = { angle: "skill", key: "listening" } as const;
    const ae = attempt({ source: "retest", skill: "listening", tags: [TAG, "phoneme:ae"] });
    expect(matchesWeakness(ae, W)).toBe(true);
    expect(matchesWeakness(ae, listening)).toBe(false); // same skill, but it targets another weakness
    expect(matchesWeakness(attempt({ source: "drill", skill: "listening", tags: ["phoneme:ae"] }), W)).toBe(false);
    expect(matchesWeakness(attempt({ source: "drill", tags: [weaknessTag(listening)] }), listening)).toBe(true);
  });
});

describe("sessionResults", () => {
  it("passes at a mean score of exactly 0.8 and not below, with 5 or more graded attempts", () => {
    const a = [
      ...session("s-4of5", "retest", 4, 5, daysAgo(3)),
      ...session("s-79", "retest", 79, 100, daysAgo(3)),
      ...session("s-80", "retest", 80, 100, daysAgo(3)),
      ...session("s-7of9", "retest", 7, 9, daysAgo(3)), // 77.8%
      ...session("s-7of8", "retest", 7, 8, daysAgo(3)),
      ...session("s-6of8", "retest", 6, 8, daysAgo(3)),
    ];
    const byId = Object.fromEntries(sessionResults(a, W, TZ).map((r) => [r.sessionId, r.passed]));
    expect(byId).toEqual({ "s-4of5": true, "s-79": false, "s-80": true, "s-7of9": false, "s-7of8": true, "s-6of8": false });
  });

  it("uses partial credit: the session score is the mean of scores", () => {
    const eight = (score: number) =>
      Array.from({ length: 8 }, () => attempt({ source: "retest", sessionId: "p", tags: [TAG], score, correct: score === 1 }));
    const ok = sessionResults(eight(0.8), W, TZ)[0]; // 6.4 of 8
    expect(ok.passed).toBe(true);
    expect(ok.score).toBeCloseTo(0.8, 10);
    expect(sessionResults(eight(0.79), W, TZ)[0].passed).toBe(false);
  });

  it("cannot be passed with fewer than 5 graded attempts", () => {
    const [r] = sessionResults(session("s", "retest", 4, 4, daysAgo(2)), W, TZ);
    expect(r).toMatchObject({ passed: false, graded: 4, score: 1 });
  });

  it("ignores ungraded attempts when scoring and counting", () => {
    const ungraded = Array.from({ length: 10 }, () =>
      attempt({ source: "retest", sessionId: "s", tags: [TAG], correct: true, score: null, createdAt: daysAgo(2) }),
    );
    // only 4 graded perfect answers + 10 self-rated: cannot pass
    expect(sessionResults([...session("s", "retest", 4, 4, daysAgo(2)), ...ungraded], W, TZ)[0].passed).toBe(false);
    // 5 graded perfect + 10 self-rated wrong: score only from graded
    const wrong = ungraded.map((a) => ({ ...a, correct: false }));
    expect(sessionResults([...session("s", "retest", 5, 5, daysAgo(2)), ...wrong], W, TZ)[0]).toMatchObject({ passed: true, score: 1, graded: 5 });
  });

  it("ignores drill attempts, attempts without a session, and other weaknesses", () => {
    const a = [
      ...session("d1", "drill", 8, 8, daysAgo(1)),
      attempt({ source: "retest", sessionId: null, tags: [TAG] }),
      ...session("other", "retest", 8, 8, daysAgo(1), weaknessTag({ angle: "phoneme", key: "phoneme:th" })),
    ];
    expect(sessionResults(a, W, TZ)).toEqual([]);
  });

  it("returns ISO strings and dates a session by its last attempt in the user's zone", () => {
    const [r] = sessionResults(session("s", "retest", 8, 8, new Date("2026-06-14T17:00:00Z")), W, TZ);
    expect(r.completedAt).toBe("2026-06-14T17:00:00.000Z");
    expect(r.localDate).toBe("2026-06-15");
  });

  it("dates a session that spans local midnight by its last attempt", () => {
    const first = Array.from({ length: 4 }, (_, i) =>
      attempt({ source: "retest", sessionId: "m", tags: [TAG], createdAt: new Date(Date.parse("2026-06-14T16:59:00Z") + i * 1000) }),
    );
    const last = Array.from({ length: 4 }, (_, i) =>
      attempt({ source: "retest", sessionId: "m", tags: [TAG], createdAt: new Date(Date.parse("2026-06-14T17:01:00Z") + i * 1000) }),
    );
    const [r] = sessionResults([...first, ...last], W, TZ);
    expect(r.localDate).toBe("2026-06-15");
    expect(r.graded).toBe(8);
  });
});

describe("weaknessStatus", () => {
  it("is not_started with no drill or retest attempts", () => {
    expect(status([])).toBe("not_started");
    expect(status(lesson(5, 5, daysAgo(1)))).toBe("not_started");
  });

  it("is in_progress after a drill, or after only failed retests", () => {
    expect(status(session("d", "drill", 8, 8, daysAgo(2)))).toBe("in_progress");
    expect(status(session("r", "retest", 6, 8, daysAgo(2)))).toBe("in_progress");
  });

  it("is awaiting_retest after one passed retest session", () => {
    expect(status(session("r1", "retest", 7, 8, daysAgo(2)))).toBe("awaiting_retest");
  });

  it("stays awaiting_retest when two passes fall on the same calendar day", () => {
    const a = [
      ...session("r1", "retest", 8, 8, new Date("2026-06-13T03:00:00Z")),
      ...session("r2", "retest", 8, 8, new Date("2026-06-13T10:00:00Z")),
    ];
    expect(status(a)).toBe("awaiting_retest");
  });

  it("is fixed with two passes on different days", () => {
    const a = [...session("r1", "retest", 7, 8, daysAgo(3)), ...session("r2", "retest", 8, 8, daysAgo(2))];
    expect(status(a)).toBe("fixed");
  });

  it("uses the user's time zone for 'different days'", () => {
    const a = [
      ...session("r1", "retest", 8, 8, new Date("2026-06-14T16:30:00Z")), // 23:30 on 14 Jun in Bangkok
      ...session("r2", "retest", 8, 8, new Date("2026-06-14T17:30:00Z")), // 00:30 on 15 Jun
    ];
    expect(weaknessStatus(a, W, NOW, "Asia/Bangkok").status).toBe("fixed");
    expect(weaknessStatus(a, W, NOW, "UTC").status).toBe("awaiting_retest");
  });

  it("does not count a failed retest as a pass", () => {
    const a = [...session("r1", "retest", 8, 8, daysAgo(3)), ...session("r2", "retest", 5, 8, daysAgo(2))];
    expect(status(a)).toBe("awaiting_retest");
  });

  it("is not advanced by retests that target a different weakness (same skill)", () => {
    const listening = { angle: "skill", key: "listening" } as const;
    const aeRetests = [
      ...session("r1", "retest", 8, 8, daysAgo(3)).map((a) => ({ ...a, skill: "listening" })),
      ...session("r2", "retest", 8, 8, daysAgo(2)).map((a) => ({ ...a, skill: "listening" })),
    ];
    expect(status(aeRetests, listening)).toBe("not_started");
    expect(status(aeRetests, W)).toBe("fixed");
  });

  it("reopens (new cycle, not_started) when later lesson error rate is back at 30%", () => {
    const fixed = [...session("r1", "retest", 8, 8, daysAgo(6)), ...session("r2", "retest", 8, 8, daysAgo(5))];
    expect(status([...fixed, ...lesson(3, 10, daysAgo(1))])).toBe("not_started"); // exactly 30%
    expect(status([...fixed, ...lesson(2, 10, daysAgo(1))])).toBe("fixed"); // 20%
    expect(status([...fixed, ...lesson(4, 4, daysAgo(1))])).toBe("fixed"); // under 5 attempts
  });

  it("ignores lesson errors from before the fix", () => {
    const fixed = [...session("r1", "retest", 8, 8, daysAgo(6)), ...session("r2", "retest", 8, 8, daysAgo(5))];
    expect(status([...lesson(10, 10, daysAgo(10)), ...fixed])).toBe("fixed");
  });

  it("restarts the cycle after reopening: old passes do not count, new activity does", () => {
    const fixed = [...session("r1", "retest", 8, 8, daysAgo(6)), ...session("r2", "retest", 8, 8, daysAgo(5))];
    const bad = lesson(5, 5, daysAgo(3));
    expect(status([...fixed, ...bad, ...session("d", "drill", 8, 8, daysAgo(1))])).toBe("in_progress");
    const again = [...session("r3", "retest", 8, 8, daysAgo(2)), ...session("r4", "retest", 8, 8, daysAgo(1))];
    expect(status([...fixed, ...bad, ...again])).toBe("fixed");
  });

  it("remembers a reopening that is older than the 14-day window", () => {
    const a = [
      ...session("r1", "retest", 8, 8, daysAgo(40)),
      ...session("r2", "retest", 8, 8, daysAgo(39)),
      ...lesson(5, 5, daysAgo(30)), // reopens
      ...session("d", "drill", 8, 8, daysAgo(20)),
      ...session("r3", "retest", 8, 8, daysAgo(18)),
    ];
    expect(status(a)).toBe("awaiting_retest");
  });

  it("evaluates the reopen rule as of each attempt's time (window ending at that attempt)", () => {
    // 5 wrong lessons 30 days ago, then 30 right ones yesterday: weak at the time, fine now
    const a = [
      ...session("r1", "retest", 8, 8, daysAgo(40)),
      ...session("r2", "retest", 8, 8, daysAgo(39)),
      ...lesson(5, 5, daysAgo(30)),
      ...lesson(0, 30, daysAgo(1)),
    ];
    expect(status(a)).toBe("not_started");
  });

  it("closes an open cycle when the lesson error rate recovers on its own", () => {
    const a = [...session("d", "drill", 8, 8, daysAgo(3)), ...lesson(1, 20, daysAgo(1))]; // 5%
    expect(status(a)).toBe("not_started");
  });

  it("closes the cycle at the moment of natural recovery, so old passes do not come back after a relapse", () => {
    const a = [
      ...session("r0", "retest", 8, 8, daysAgo(40)), // one pass long ago
      ...lesson(0, 6, daysAgo(32)), // recovered (0% with 6 attempts)
      ...lesson(3, 5, daysAgo(3)), // relapse: 60%
    ];
    const ev = weaknessStatus(a, W, NOW, TZ);
    expect(ev.status).toBe("not_started");
    expect(ev.passedOn).toBeNull();
    // one fresh pass is only "awaiting", not fixed
    const one = weaknessStatus([...a, ...session("r1", "retest", 8, 8, daysAgo(1))], W, NOW, TZ);
    expect(one.status).toBe("awaiting_retest");
    expect(one.passedOn).toBe("2026-06-14");
  });

  it("needs two fresh passes on different days after a recovery and relapse", () => {
    const a = [
      ...session("r0", "retest", 8, 8, daysAgo(40)),
      ...lesson(0, 6, daysAgo(32)),
      ...lesson(3, 5, daysAgo(3)),
      ...session("r1", "retest", 8, 8, daysAgo(2)),
      ...session("r2", "retest", 8, 8, daysAgo(1)),
    ];
    expect(status(a)).toBe("fixed");
  });

  it("reports the error rate from lesson attempts after the fix only", () => {
    const fixed = [...session("r1", "retest", 8, 8, daysAgo(6)), ...session("r2", "retest", 8, 8, daysAgo(5))];
    const ev = weaknessStatus([...lesson(5, 10, daysAgo(10)), ...fixed, ...lesson(1, 10, daysAgo(1))], W, NOW, TZ);
    expect(ev).toMatchObject({ status: "fixed", attempts: 10 });
    expect(ev.errorRate).toBeCloseTo(0.1, 3); // weights differ by seconds
  });

  it("falls back to Asia/Bangkok for a bad time zone instead of throwing", () => {
    expect(weaknessStatus(session("d", "drill", 8, 8, daysAgo(1)), W, NOW, "Asia/Bankok").status).toBe("in_progress");
  });
});

describe("weakPoints", () => {
  const fixedFor = (...ds: [number, number]) => [
    ...session("r1", "retest", 8, 8, daysAgo(ds[0])),
    ...session("r2", "retest", 8, 8, daysAgo(ds[1])),
  ];
  const run = (a: AttemptLike[]) => weakPoints(a, NOW, TZ);

  it("is empty for no attempts", () => {
    expect(run([])).toEqual([]);
  });

  it("lists weak groups with status not_started, ordered by angle then error rate", () => {
    const a = [
      ...lesson(5, 10, daysAgo(1), { exerciseType: "x", skill: "reading" }),
      ...Array.from({ length: 10 }, (_, i) => attempt({ exerciseType: "y", skill: "writing", correct: i < 7 })),
    ];
    const r = run(a);
    expect(r.map((p) => `${p.angle}:${p.key}`)).toEqual([
      "phoneme:phoneme:ae",
      "exerciseType:x",
      "exerciseType:y",
      "skill:reading",
      "skill:writing",
    ]);
    expect(r.every((p) => p.status === "not_started")).toBe(true);
  });

  it("keeps at most 5 per angle", () => {
    const a = Array.from({ length: 7 }, (_, i) => lesson(5, 10, daysAgo(1), { tags: [`phoneme:p${i}`] })).flat();
    expect(run(a).filter((p) => p.angle === "phoneme")).toHaveLength(5);
  });

  it("does not list a fixed weakness even though the 14-day rate is still high", () => {
    const a = [...lesson(5, 10, daysAgo(10)), ...fixedFor(6, 5)];
    expect(run(a).filter((p) => p.key === "phoneme:ae")).toEqual([]);
  });

  it("lists a reopened weakness again", () => {
    const a = [...fixedFor(6, 5), ...lesson(5, 10, daysAgo(1))];
    expect(run(a).filter((p) => p.key === "phoneme:ae")).toMatchObject([{ status: "not_started" }]);
  });

  it("lists an in-progress weakness in the 15-30% band, which plain detection would hide", () => {
    // the two misses come first, so the rate never drops under 15% on the way
    const wrongFirst = Array.from({ length: 10 }, (_, i) =>
      attempt({ tags: ["phoneme:ae"], correct: i >= 2, createdAt: new Date(daysAgo(1).getTime() - (9 - i) * 1000) }),
    );
    const withDrill = [...wrongFirst, ...session("d", "drill", 8, 8, daysAgo(2))];
    expect(run(withDrill)).toMatchObject([{ key: "phoneme:ae", status: "in_progress", attempts: 10 }]);
    expect(run(wrongFirst)).toEqual([]); // no drill cycle: not weak, not listed
  });

  it("lists an awaiting-retest weakness with too few new attempts to judge", () => {
    const a = [...lesson(1, 3, daysAgo(1)), ...session("r1", "retest", 8, 8, daysAgo(1))];
    expect(run(a)).toMatchObject([{ status: "awaiting_retest", attempts: 3 }]);
  });

  it("lists a weakness that only has drill attempts and no lessons in the window", () => {
    expect(run(session("d", "drill", 8, 8, daysAgo(2)))).toMatchObject([{ key: "phoneme:ae", status: "in_progress", attempts: 0, errorRate: 0 }]);
  });

  it("stops listing a weakness that recovered naturally (< 15% with 5+ attempts)", () => {
    expect(run([...session("d", "drill", 8, 8, daysAgo(3)), ...lesson(1, 20, daysAgo(1))])).toEqual([]);
  });

  it("reports the retest pass date so the recommendation can skip it today", () => {
    const a = [...lesson(5, 10, daysAgo(1)), ...session("r1", "retest", 8, 8, NOW)];
    expect(run(a)[0]).toMatchObject({ status: "awaiting_retest", passedOn: "2026-06-15" });
  });

  it("is not confused by retests of another weakness with the same skill", () => {
    const a = [
      ...lesson(5, 10, daysAgo(1), { skill: "listening", tags: [] }),
      ...fixedFor(3, 2), // retests for phoneme:ae (skill reading by default)
    ];
    const listening = run(a).find((p) => p.key === "listening");
    expect(listening).toMatchObject({ status: "not_started" });
  });
});

describe("recommendDrills", () => {
  const p = (key: string, st: WeakPoint["status"], errorRate: number, over: Partial<WeakPoint> = {}): WeakPoint => ({
    angle: "exerciseType",
    key,
    status: st,
    errorRate,
    attempts: 10,
    passedOn: null,
    ...over,
  });
  const TODAY = "2026-06-15";

  it("is empty for no candidates", () => {
    expect(recommendDrills([], TODAY)).toEqual([]);
  });

  it("picks at most 2, worst error rate first, skipping fixed ones", () => {
    const r = recommendDrills([p("a", "not_started", 0.4), p("b", "fixed", 0.9), p("c", "in_progress", 0.6), p("d", "awaiting_retest", 0.5)], TODAY);
    expect(r.map((x) => x.key)).toEqual(["c", "d"]);
  });

  it("skips an awaiting-retest weakness that already passed a retest today, but not one that passed yesterday", () => {
    const r = recommendDrills(
      [p("a", "awaiting_retest", 0.9, { passedOn: TODAY }), p("b", "awaiting_retest", 0.8, { passedOn: "2026-06-14" }), p("c", "not_started", 0.3)],
      TODAY,
    );
    expect(r.map((x) => x.key)).toEqual(["b", "c"]);
  });

  it("breaks ties (within an epsilon) by angle order then key, independent of input order", () => {
    const x: WeakPoint = { ...p("z", "not_started", 0.5), angle: "phoneme" };
    const y = p("a", "not_started", 0.5 + 1e-12);
    const z = p("b", "not_started", 0.5);
    expect(recommendDrills([z, y, x], TODAY).map((r) => r.key)).toEqual(["z", "a"]);
    expect(recommendDrills([x, y, z], TODAY).map((r) => r.key)).toEqual(["z", "a"]);
  });
});

describe("scan performance and equivalence", () => {
  const LISTENING = { angle: "skill", key: "listening" } as const;
  const T0 = Date.parse("2025-01-01T05:00:00Z");
  const fixedLongAgo = [
    ...session("r1", "retest", 8, 8, new Date(T0 - 3 * 86_400_000), weaknessTag(LISTENING)),
    ...session("r2", "retest", 8, 8, new Date(T0 - 2 * 86_400_000), weaknessTag(LISTENING)),
  ];
  /** n listening lessons one every `stepMs` after T0; wrong when wrongAt(i) */
  const stream = (n: number, stepMs: number, wrongAt: (i: number) => boolean) =>
    Array.from({ length: n }, (_, i) =>
      attempt({ skill: "listening", exerciseType: `t${i % 7}`, correct: !wrongAt(i), createdAt: new Date(T0 + i * stepMs) }),
    );

  /** the straightforward O(n^2) reopen search, for comparison */
  function referenceReopen(lessons: AttemptLike[]): number | null {
    const times = [...new Set(lessons.map((a) => a.createdAt.getTime()))].sort((x, y) => x - y);
    for (const t of times) {
      const s = groupStats(lessons.filter((a) => a.createdAt.getTime() <= t), new Date(t)).find((g) => g.angle === "skill" && g.key === "listening");
      if (s?.weak) return t;
    }
    return null;
  }

  it("finds exactly the same reopen moment as the straightforward implementation", () => {
    for (const mod of [2, 3]) {
      const lessons = stream(300, 3_600_000, (i) => i % mod === mod - 1);
      const ref = referenceReopen(lessons);
      const now = new Date(T0 + 300 * 3_600_000);
      expect(ref).not.toBeNull();
      // a drill 1 ms before the reopen does not count; 1 ms after it does
      const before = [...fixedLongAgo, ...lessons, ...session("d", "drill", 8, 8, new Date(ref! - 1), weaknessTag(LISTENING))];
      const after = [...fixedLongAgo, ...lessons, ...session("d", "drill", 8, 8, new Date(ref! + 1000), weaknessTag(LISTENING))];
      expect(weaknessStatus(before, LISTENING, now, TZ).status).toBe("not_started");
      expect(weaknessStatus(after, LISTENING, now, TZ).status).toBe("in_progress");
    }
  });

  it("reports the same error rate as groupStats and stays fast over ~5,000 post-fix attempts", () => {
    const lessons = stream(5000, 3_600_000, (i) => i % 20 === 10); // ~5% wrong, never reopens
    const now = new Date(T0 + 5000 * 3_600_000);
    const started = Date.now();
    const ev = weaknessStatus([...fixedLongAgo, ...lessons], LISTENING, now, TZ);
    const elapsed = Date.now() - started;
    const ref = groupStats(lessons, now).find((g) => g.angle === "skill" && g.key === "listening");
    expect(ev.status).toBe("fixed");
    expect(ev.attempts).toBe(ref?.attempts);
    expect(ev.errorRate).toBeCloseTo(ref?.errorRate ?? -1, 12);
    expect(elapsed).toBeLessThan(10_000);
  });
});
