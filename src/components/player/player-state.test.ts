import { describe, expect, it } from "vitest";
import { get, readLesson } from "@/lib/answers/test-content";
import type { Grade } from "@/lib/answers/grade";
import type { AttemptAnswer } from "@/lib/attempts/contract";
import type { Exercise, Lesson } from "@/lib/content/schema";
import {
  buildSteps, canAdvance, createPlayerState, currentItem, elapsedMs, firstAttemptScore, playerReducer, type PlayerState,
} from "./player-state";

const SESSION = "11111111-1111-4111-8111-111111111111";
const RIGHT: Grade = { correct: true, score: 1 };
const WRONG: Grade = { correct: false, score: 0 };
const ANSWER: AttemptAnswer = { kind: "choice", selected: 0 };
const SUPPORTED = new Set(["phoneme_intro", "listen_choose", "dictation", "repeat_after_me", "minimal_pair", "shadowing"]);
const isSupported = (t: string) => SUPPORTED.has(t);

function lessonOf(ids: string[]): Lesson {
  const exercises = ids.map(get) as Exercise[];
  return { ...readLesson(1), sections: [{ skill: "listening", title: { en: "A", th: "ก" }, exercises: exercises.slice(0, 2) }, ...(exercises.length > 2 ? [{ skill: "speaking" as const, title: { en: "B", th: "ข" }, exercises: exercises.slice(2) }] : [])] };
}
const start = (ids: string[], now = 1000) => createPlayerState({ lesson: lessonOf(ids), sessionId: SESSION, now, isSupported });
const answer = (s: PlayerState, grade: Grade, now = 2000) => playerReducer(s, { type: "answer", answer: ANSWER, grade, now });
const next = (s: PlayerState, now = 3000) => playerReducer(s, { type: "next", now });

describe("buildSteps", () => {
  it("flattens sections in order and keeps the section title", () => {
    const steps = buildSteps(lessonOf(["d001-pron-01", "d001-pron-02", "d001-listen-01"]));
    expect(steps.map((s) => s.exercise.id)).toEqual(["d001-pron-01", "d001-pron-02", "d001-listen-01"]);
    expect(steps.map((s) => s.sectionTitle.th)).toEqual(["ก", "ก", "ข"]);
  });
});

describe("playerReducer", () => {
  it("starts on the first step with the session id and start time", () => {
    const s = start(["d001-listen-01", "d001-listen-02"], 500);
    expect(s.sessionId).toBe(SESSION);
    expect(s.phase).toBe("playing");
    expect(currentItem(s).step.exercise.id).toBe("d001-listen-01");
    expect(currentItem(s).attemptNo).toBe(1);
    expect(s.startedAt).toBe(500);
  });

  it("locks next until the exercise is answered", () => {
    let s = start(["d001-listen-01", "d001-listen-02"]);
    expect(canAdvance(s)).toBe(false);
    expect(next(s)).toBe(s); // no-op
    s = answer(s, RIGHT);
    expect(canAdvance(s)).toBe(true);
    s = next(s);
    expect(currentItem(s).step.exercise.id).toBe("d001-listen-02");
  });

  it("is open at once for an ungraded step (phoneme_intro)", () => {
    const s = start(["d001-pron-01", "d001-listen-01"]);
    expect(canAdvance(s)).toBe(true);
    expect(currentItem(next(s)).step.exercise.id).toBe("d001-listen-01");
  });

  it("ignores an answer for an ungraded step and a second answer for the same step", () => {
    const intro = start(["d001-pron-01"]);
    expect(answer(intro, RIGHT)).toBe(intro);
    let s = start(["d001-listen-01"]);
    s = answer(s, WRONG);
    expect(answer(s, RIGHT)).toBe(s);
  });

  it("restarts the exercise clock on each step and measures it with a monotonic now", () => {
    let s = start(["d001-listen-01", "d001-listen-02"], 1000);
    expect(elapsedMs(s, 4500)).toBe(3500);
    s = next(answer(s, RIGHT, 4500), 5000);
    expect(s.startedAt).toBe(5000);
    expect(elapsedMs(s, 5200)).toBe(200);
    expect(elapsedMs(s, 100)).toBe(0); // clamped, never negative
  });

  it("with nothing wrong goes straight to completion after the last step", () => {
    let s = start(["d001-listen-01"]);
    s = next(answer(s, RIGHT));
    expect(s.phase).toBe("complete");
  });

  it("builds a retry round with exactly the wrong retryable exercises, in order, once", () => {
    // listen_choose (wrong), dictation (right), minimal_pair (wrong), repeat_after_me (wrong but self-rated)
    let s = start(["d001-listen-01", "d001-listen-02", "d001-pron-02", "d001-pron-03"]);
    s = next(answer(s, WRONG));
    s = next(answer(s, RIGHT));
    s = next(answer(s, WRONG));
    s = next(answer(s, WRONG)); // self-rated "unsure": never retried
    expect(s.phase).toBe("playing");
    expect(currentItem(s).step.exercise.id).toBe("d001-listen-01");
    expect(currentItem(s).attemptNo).toBe(2);
    expect(currentItem(s).key).toBe("d001-listen-01-2");
    s = next(answer(s, RIGHT));
    expect(currentItem(s).step.exercise.id).toBe("d001-pron-02");
    expect(currentItem(s).attemptNo).toBe(2);
    s = next(answer(s, RIGHT));
    expect(s.phase).toBe("complete");
  });

  it("does not loop when a retry is wrong too", () => {
    let s = start(["d001-listen-01"]);
    s = next(answer(s, WRONG));
    expect(currentItem(s).attemptNo).toBe(2);
    s = next(answer(s, WRONG));
    expect(s.phase).toBe("complete");
  });

  it("never retries skipped, ungraded or unsupported steps and records no answer for them", () => {
    let s = createPlayerState({ lesson: readLesson(3), sessionId: SESSION, now: 0, isSupported });
    for (let guard = 0; s.phase === "playing" && guard < 100; guard++) {
      const item = currentItem(s);
      if (!item.step.supported) expect(canAdvance(s)).toBe(false);
      s = item.step.exercise.type === "phoneme_intro" ? next(s) : playerReducer(s, { type: "skip", now: guard });
    }
    expect(s.phase).toBe("complete"); // skipped exercises are not wrong, so there is no retry round
    expect(s.items.every((i) => i.attemptNo === 1)).toBe(true);
    expect(Object.keys(s.answers)).toEqual([]);
  });

  it("marks types missing from the registry as unsupported", () => {
    const s = createPlayerState({ lesson: readLesson(3), sessionId: SESSION, now: 0, isSupported });
    const types = s.items.filter((i) => !i.step.supported).map((i) => i.step.exercise.type);
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((t) => !isSupported(t))).toBe(true);
  });

  it("firstAttemptScore averages only first-try scores and ignores null scores", () => {
    let s = start(["d001-listen-01", "d001-listen-02", "d001-pron-03"]);
    s = next(answer(s, { correct: true, score: 1 }));
    s = next(answer(s, { correct: false, score: 0.5 }));
    s = next(answer(s, { correct: true, score: null }));
    expect(firstAttemptScore(s)).toBe(0.75);
    // the retry of the second one does not change the first-attempt score
    s = next(answer(s, RIGHT));
    expect(firstAttemptScore(s)).toBe(0.75);
  });

  it("firstAttemptScore is null when nothing was scored", () => {
    expect(firstAttemptScore(start(["d001-pron-01"]))).toBeNull();
  });
});
