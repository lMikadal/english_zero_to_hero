import { describe, expect, it } from "vitest";
import { CHECKPOINT_PASS_SCORE } from "@/lib/progress/config";
import { checkpointFixture } from "@/lib/answers/test-content";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import { checkpointSummary, isCheckpointPass, scoreCheckpoint, weakSkills, type ScoreRow } from "./score";

const T = (s: number) => new Date(Date.UTC(2026, 10, 28, 10, 0, s));
const row = (exerciseId: string, score: number | null, over: Partial<ScoreRow> = {}): ScoreRow => ({ exerciseId, score, correct: score === 1, createdAt: T(0), ...over });
const ids = (skill: string) => checkpointFixture.sections.find((s) => s.skill === skill)!.exercises.map((e) => e.id);
const all = (skill: string, score: number) => ids(skill).map((id) => row(id, score));
const skill = (r: ReturnType<typeof scoreCheckpoint>, name: string) => r.skills.find((s) => s.skill === name)!;

describe("scoreCheckpoint", () => {
  it("a perfect sitting scores 1 and has one result per section, in file order", () => {
    const rows = [...all("pronunciation", 1), ...all("listening", 1), ...all("reading", 1), ...all("writing", 1), ...ids("speaking").map((id) => row(id, null, { correct: true }))];
    const r = scoreCheckpoint(checkpointFixture, rows);
    expect(r.score).toBeCloseTo(1, 12);
    expect(r.skills.map((s) => s.skill)).toEqual(["pronunciation", "listening", "speaking", "reading", "writing"]);
    expect(r.skills.map((s) => s.weight)).toEqual([20, 25, 0, 20, 35]);
  });

  it("weights the sections: only pronunciation right = 20%, only writing right = 35%", () => {
    expect(scoreCheckpoint(checkpointFixture, all("pronunciation", 1)).score).toBeCloseTo(0.2, 12);
    expect(scoreCheckpoint(checkpointFixture, all("writing", 1)).score).toBeCloseTo(0.35, 12);
    expect(scoreCheckpoint(checkpointFixture, [...all("listening", 1), ...all("reading", 1)]).score).toBeCloseTo(0.45, 12);
  });

  it("a section is the plain mean of the scores of ALL its exercises (partial scores count)", () => {
    const [a, b, c] = ids("pronunciation");
    const r = scoreCheckpoint(checkpointFixture, [row(a, 0.75), row(b, 0.5), row(c, 0)]);
    expect(skill(r, "pronunciation").score).toBeCloseTo(1.25 / 3, 12);
    expect(r.score).toBeCloseTo((20 * (1.25 / 3)) / 100, 12);
  });

  it("an exercise with no answer scores 0 and the divisor stays the size of the section (D12)", () => {
    const [first] = ids("listening");
    const r = scoreCheckpoint(checkpointFixture, [row(first, 1)]);
    expect(skill(r, "listening")).toMatchObject({ score: 1 / 3, answered: 1, total: 3, selfOk: null });
    expect(skill(r, "pronunciation")).toMatchObject({ score: 0, answered: 0, total: 3 });
    expect(scoreCheckpoint(checkpointFixture, []).score).toBe(0);
  });

  it("a null score on a scored section counts as 0 but the exercise counts as answered", () => {
    const [first] = ids("reading");
    expect(skill(scoreCheckpoint(checkpointFixture, [row(first, null)]), "reading")).toMatchObject({ score: 0, answered: 1, total: 3 });
  });

  it("with several rows for one exercise the OLDEST wins; on equal time the smaller id wins", () => {
    const [id] = ids("writing");
    const older = scoreCheckpoint(checkpointFixture, [row(id, 1, { id: "b", createdAt: T(5) }), row(id, 0, { id: "a", createdAt: T(1) })]);
    expect(skill(older, "writing").score).toBe(0);
    const tie = scoreCheckpoint(checkpointFixture, [row(id, 1, { id: "b", createdAt: T(3) }), row(id, 0, { id: "a", createdAt: T(3) })]);
    expect(skill(tie, "writing").score).toBe(0);
    const tieOther = scoreCheckpoint(checkpointFixture, [row(id, 0, { id: "b", createdAt: T(3) }), row(id, 1, { id: "a", createdAt: T(3) })]);
    expect(skill(tieOther, "writing").score).toBeCloseTo(1 / 4, 12);
    // order of the input does not matter
    const rows = [row(id, 1, { id: "b", createdAt: T(5) }), row(id, 0, { id: "a", createdAt: T(1) })];
    expect(scoreCheckpoint(checkpointFixture, [...rows].reverse())).toEqual(scoreCheckpoint(checkpointFixture, rows));
  });

  it("the not-scored speaking section has score null, counts what the learner rated ok, and adds nothing to the total", () => {
    const [a, b, c] = ids("speaking");
    const r = scoreCheckpoint(checkpointFixture, [row(a, null, { correct: true }), row(b, null, { correct: false }), row(c, null, { correct: true })]);
    expect(skill(r, "speaking")).toEqual({ skill: "speaking", weight: 0, score: null, answered: 3, total: 3, selfOk: 2 });
    expect(r.score).toBe(0);
    const none = scoreCheckpoint(checkpointFixture, []);
    expect(skill(none, "speaking")).toMatchObject({ score: null, answered: 0, total: 3, selfOk: 0 });
  });

  it("ignores rows for exercises that are not in the file", () => {
    const r = scoreCheckpoint(checkpointFixture, [row("c030-pron-99", 1), row("d001-pron-01", 1)]);
    expect(r.score).toBe(0);
    expect(skill(r, "pronunciation").answered).toBe(0);
  });

  it("exactly 70% passes and the total never exceeds 1 (the DB CHECK is 0..1)", () => {
    const cp: Checkpoint = {
      ...checkpointFixture,
      sections: [
        { ...checkpointFixture.sections[0], weight: 70 },
        { ...checkpointFixture.sections[1], weight: 30 },
      ],
    };
    const r = scoreCheckpoint(cp, all("pronunciation", 1));
    expect(r.score).toBeCloseTo(0.7, 12);
    expect(isCheckpointPass(r.score)).toBe(true);
    const full = scoreCheckpoint(cp, [...all("pronunciation", 1), ...all("listening", 1)]);
    expect(full.score).toBeLessThanOrEqual(1);
    const thirds: Checkpoint = { ...checkpointFixture, sections: [{ ...checkpointFixture.sections[0], weight: 33 }, { ...checkpointFixture.sections[1], weight: 33 }, { ...checkpointFixture.sections[3], weight: 34 }] };
    expect(scoreCheckpoint(thirds, [...all("pronunciation", 1), ...all("listening", 1), ...all("reading", 1)]).score).toBeLessThanOrEqual(1);
  });
});

describe("isCheckpointPass / weakSkills", () => {
  it("passes at CHECKPOINT_PASS_SCORE (0.7) and not below", () => {
    expect(CHECKPOINT_PASS_SCORE).toBe(0.7);
    expect(isCheckpointPass(0.7)).toBe(true);
    expect(isCheckpointPass(0.7 - 1e-12)).toBe(true);
    expect(isCheckpointPass(0.699)).toBe(false);
    expect(isCheckpointPass(0)).toBe(false);
    expect(isCheckpointPass(1)).toBe(true);
  });

  it("weakSkills lists the scored sections under 70%, never the not-scored one", () => {
    const r = scoreCheckpoint(checkpointFixture, [...all("pronunciation", 1), ...all("listening", 0.5)]);
    expect(weakSkills(r.skills).map((s) => s.skill)).toEqual(["listening", "reading", "writing"]);
    const exactly = { skill: "reading" as const, weight: 20, score: 0.7, answered: 3, total: 3, selfOk: null };
    expect(weakSkills([exactly])).toEqual([]);
    expect(weakSkills([{ ...exactly, weight: 0, score: null, selfOk: 0 }])).toEqual([]);
  });
});

describe("checkpointSummary", () => {
  const res = (afterDay: number, score: number, s: number) => ({ afterDay, score, completedAt: T(s) });

  it("is empty for no results", () => {
    expect(checkpointSummary([])).toEqual([]);
  });

  it("per checkpoint: number of sittings, latest score, best score, passed if any sitting passed; ordered by afterDay", () => {
    const out = checkpointSummary([res(60, 0.9, 1), res(30, 0.5, 1), res(30, 0.8, 5), res(30, 0.6, 9)]);
    expect(out).toEqual([
      { afterDay: 30, sittings: 3, latest: 0.6, best: 0.8, passed: true },
      { afterDay: 60, sittings: 1, latest: 0.9, best: 0.9, passed: true },
    ]);
  });

  it("latest is by completedAt, not by input order; not passed when no sitting reached 70%", () => {
    expect(checkpointSummary([res(30, 0.6, 9), res(30, 0.4, 1)])).toEqual([{ afterDay: 30, sittings: 2, latest: 0.6, best: 0.6, passed: false }]);
  });

  it("0.7 exactly is a pass", () => {
    expect(checkpointSummary([res(30, 0.7, 1)])[0].passed).toBe(true);
  });
});
