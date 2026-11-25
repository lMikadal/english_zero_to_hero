import { describe, expect, it } from "vitest";
import { matchesWeakness, recommendDrills, sessionResults, weaknessStatus } from "./drills";
import { attempt, daysAgo, NOW } from "./test-utils";
import type { AttemptLike } from "./types";

const TZ = "Asia/Bangkok";
const W = { angle: "phoneme", key: "phoneme:ae" } as const;

/** A session of `total` attempts tagged phoneme:ae with `right` correct, finishing at `at`. */
function session(id: string, source: "drill" | "retest", right: number, total: number, at: Date): AttemptLike[] {
  return Array.from({ length: total }, (_, i) =>
    attempt({
      source,
      sessionId: id,
      tags: ["phoneme:ae"],
      correct: i < right,
      createdAt: new Date(at.getTime() - (total - 1 - i) * 1000),
    }),
  );
}

const status = (attempts: AttemptLike[], now = NOW) => weaknessStatus(attempts, W, now, TZ).status;

describe("matchesWeakness", () => {
  it("matches by tag, exercise type or skill", () => {
    expect(matchesWeakness(attempt({ tags: ["phoneme:ae"] }), W)).toBe(true);
    expect(matchesWeakness(attempt({ tags: ["phoneme:th"] }), W)).toBe(false);
    expect(matchesWeakness(attempt({ exerciseType: "dictation" }), { angle: "exerciseType", key: "dictation" })).toBe(true);
    expect(matchesWeakness(attempt({ skill: "writing" }), { angle: "skill", key: "writing" })).toBe(true);
    expect(matchesWeakness(attempt({ skill: "writing" }), { angle: "skill", key: "reading" })).toBe(false);
  });
});

describe("sessionResults", () => {
  it("groups retest attempts by session and applies the 80% rule exactly", () => {
    const a = [
      ...session("s-80", "retest", 4, 5, daysAgo(3)),
      ...session("s-79", "retest", 79, 100, daysAgo(3)),
      ...session("s-78", "retest", 7, 9, daysAgo(3)), // 77.8%
      ...session("s-7of8", "retest", 7, 8, daysAgo(3)),
      ...session("s-6of8", "retest", 6, 8, daysAgo(3)),
    ];
    const byId = Object.fromEntries(sessionResults(a, W, TZ).map((r) => [r.sessionId, r.passed]));
    expect(byId).toEqual({ "s-80": true, "s-79": false, "s-78": false, "s-7of8": true, "s-6of8": false });
  });

  it("ignores drill attempts, attempts without a session, and other weaknesses", () => {
    const a = [
      ...session("d1", "drill", 8, 8, daysAgo(1)),
      attempt({ source: "retest", sessionId: null, tags: ["phoneme:ae"] }),
      attempt({ source: "retest", sessionId: "other", tags: ["phoneme:th"] }),
    ];
    expect(sessionResults(a, W, TZ)).toEqual([]);
  });

  it("dates a session by its last attempt in the user's time zone", () => {
    // 16:59:59Z is 23:59:59 on 14 Jun in Bangkok; 17:00:00Z is already 15 Jun
    const [r] = sessionResults(session("s", "retest", 8, 8, new Date("2026-06-14T17:00:00Z")), W, TZ);
    expect(r.localDate).toBe("2026-06-15");
  });
});

describe("weaknessStatus", () => {
  it("is not_started with no drill or retest attempts", () => {
    expect(status([])).toBe("not_started");
    expect(status([attempt({ tags: ["phoneme:ae"], source: "lesson" })])).toBe("not_started");
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
    // 23:30 on 14 Jun and 00:30 on 15 Jun in Bangkok, one hour apart but the same UTC day
    const a = [
      ...session("r1", "retest", 8, 8, new Date("2026-06-14T16:30:00Z")),
      ...session("r2", "retest", 8, 8, new Date("2026-06-14T17:30:00Z")),
    ];
    expect(weaknessStatus(a, W, NOW, "Asia/Bangkok").status).toBe("fixed");
    expect(weaknessStatus(a, W, NOW, "UTC").status).toBe("awaiting_retest");
  });

  it("does not count a failed retest as a pass", () => {
    const a = [...session("r1", "retest", 8, 8, daysAgo(3)), ...session("r2", "retest", 5, 8, daysAgo(2))];
    expect(status(a)).toBe("awaiting_retest");
  });

  it("reopens (new cycle, not_started) when later lesson error rate is back at 30%", () => {
    const fixed = [...session("r1", "retest", 8, 8, daysAgo(6)), ...session("r2", "retest", 8, 8, daysAgo(5))];
    const lesson = (wrong: number, total: number) =>
      Array.from({ length: total }, (_, i) =>
        attempt({ tags: ["phoneme:ae"], correct: i >= wrong, createdAt: daysAgo(1) }),
      );
    expect(status([...fixed, ...lesson(3, 10)])).toBe("not_started"); // exactly 30%
    expect(status([...fixed, ...lesson(2, 10)])).toBe("fixed"); // 20%
    expect(status([...fixed, ...lesson(4, 4)])).toBe("fixed"); // under 5 attempts: not enough evidence
  });

  it("ignores lesson errors from before the fix and from drills when checking for reopening", () => {
    const old = Array.from({ length: 10 }, () =>
      attempt({ tags: ["phoneme:ae"], correct: false, createdAt: daysAgo(10) }),
    );
    const fixed = [...session("r1", "retest", 8, 8, daysAgo(6)), ...session("r2", "retest", 8, 8, daysAgo(5))];
    expect(status([...old, ...fixed])).toBe("fixed");
  });

  it("restarts the cycle after reopening: old passes do not count, new activity does", () => {
    const fixed = [...session("r1", "retest", 8, 8, daysAgo(6)), ...session("r2", "retest", 8, 8, daysAgo(5))];
    const bad = Array.from({ length: 5 }, () => attempt({ tags: ["phoneme:ae"], correct: false, createdAt: daysAgo(3) }));
    expect(status([...fixed, ...bad, ...session("d", "drill", 8, 8, daysAgo(1))])).toBe("in_progress");
    const again = [...session("r3", "retest", 8, 8, daysAgo(2)), ...session("r4", "retest", 8, 8, daysAgo(1))];
    expect(status([...fixed, ...bad, ...again])).toBe("fixed");
  });
});

describe("recommendDrills", () => {
  const c = (key: string, st: "not_started" | "in_progress" | "awaiting_retest" | "fixed", errorRate: number) => ({
    angle: "exerciseType" as const,
    key,
    status: st,
    errorRate,
  });

  it("is empty for no candidates", () => {
    expect(recommendDrills([])).toEqual([]);
  });

  it("picks at most 2, worst error rate first, skipping fixed ones", () => {
    const r = recommendDrills([c("a", "not_started", 0.4), c("b", "fixed", 0.9), c("c", "in_progress", 0.6), c("d", "awaiting_retest", 0.5)]);
    expect(r.map((x) => x.key)).toEqual(["c", "d"]);
  });

  it("breaks ties by angle order then key, independent of input order", () => {
    const x = { angle: "phoneme" as const, key: "z", status: "not_started" as const, errorRate: 0.5 };
    const y = c("a", "not_started", 0.5);
    const z = c("b", "not_started", 0.5);
    expect(recommendDrills([z, y, x]).map((r) => r.key)).toEqual(["z", "a"]);
    expect(recommendDrills([x, y, z]).map((r) => r.key)).toEqual(["z", "a"]);
  });
});
