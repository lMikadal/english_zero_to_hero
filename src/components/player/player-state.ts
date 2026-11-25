// Pure state machine of the lesson player (no React, no clock, no ids: those come in through arguments and
// actions). Flat list of steps from the lesson's sections, then an optional retry round (docs/plans/
// m1-lesson-player-decisions.md item 2): every exercise answered wrong that is retryable comes back once.
import { isRetryable, UNGRADED_TYPES, type Grade } from "@/lib/answers/grade";
import { clampDurationMs, type AttemptAnswer } from "@/lib/attempts/contract";
import type { Exercise, Lesson } from "@/lib/content/schema";

export type Step = {
  exercise: Exercise;
  sectionTitle: { en: string; th: string };
  /** False when no component is registered for the type: shown as "not supported", skippable, records nothing. */
  supported: boolean;
};
export type PlayItem = {
  step: Step;
  attemptNo: 1 | 2;
  /** Remount key for the exercise component: `${exercise.id}-${attemptNo}`. Also the key of `answers`. */
  key: string;
};
export type AnswerRecord = { answer: AttemptAnswer; grade: Grade };

export type PlayerState = {
  items: PlayItem[];
  index: number;
  phase: "playing" | "complete";
  /** One per play of the lesson. */
  sessionId: string;
  /** Monotonic clock reading (performance.now) when the current exercise was shown. */
  startedAt: number;
  answers: Record<string, AnswerRecord>;
  retryBuilt: boolean;
};

/** Every action names the step it was meant for (`PlayItem.key`); one for any other step is ignored. */
export type PlayerAction =
  | { type: "answer"; key: string; answer: AttemptAnswer; grade: Grade; now: number }
  | { type: "next"; key: string; now: number }
  | { type: "skip"; key: string; now: number }
  /** The answer could not be graded (a contract mismatch): treat the exercise as unsupported so the learner can skip. */
  | { type: "broken"; key: string };

const isUngraded = (type: string) => (UNGRADED_TYPES as readonly string[]).includes(type);
const item = (step: Step, attemptNo: 1 | 2): PlayItem => ({ step, attemptNo, key: `${step.exercise.id}-${attemptNo}` });

export function buildSteps(lesson: Lesson, isSupported: (type: Exercise["type"]) => boolean = () => true): Step[] {
  return lesson.sections.flatMap((section) =>
    section.exercises.map((exercise) => ({ exercise, sectionTitle: section.title, supported: isSupported(exercise.type) })),
  );
}

export function createPlayerState(args: {
  lesson: Lesson;
  sessionId: string;
  now: number;
  isSupported?: (type: Exercise["type"]) => boolean;
}): PlayerState {
  const items = buildSteps(args.lesson, args.isSupported).map((s) => item(s, 1));
  return { items, index: 0, phase: items.length === 0 ? "complete" : "playing", sessionId: args.sessionId, startedAt: args.now, answers: {}, retryBuilt: false };
}

export function currentItem(state: PlayerState): PlayItem {
  return state.items[Math.min(state.index, state.items.length - 1)];
}

export const isAnswered = (state: PlayerState): boolean => currentItem(state).key in state.answers;

/** True when the exercise records an attempt (supported and not an ungraded type like phoneme_intro). */
export const recordsAttempt = (it: PlayItem): boolean => it.step.supported && !isUngraded(it.step.exercise.type);

/** The next button is locked until the exercise is answered; ungraded steps are open at once. */
export function canAdvance(state: PlayerState): boolean {
  if (state.phase !== "playing") return false;
  const it = currentItem(state);
  if (!it.step.supported) return false;
  return isUngraded(it.step.exercise.type) || it.key in state.answers;
}

export const isRetryRound = (state: PlayerState): boolean => currentItem(state).attemptNo === 2;

/** Milliseconds since the current exercise was shown; never negative, within the contract's range. */
export function elapsedMs(state: PlayerState, now: number): number {
  return clampDurationMs(now - state.startedAt);
}

/** Mean score of first attempts that have a score (self-rated and free_write have none); null if there is none. */
export function firstAttemptScore(state: PlayerState): number | null {
  const scores = state.items
    .filter((i) => i.attemptNo === 1)
    .map((i) => state.answers[i.key]?.grade.score)
    .filter((s): s is number => typeof s === "number");
  return scores.length === 0 ? null : scores.reduce((a, b) => a + b, 0) / scores.length;
}

function advance(state: PlayerState, now: number): PlayerState {
  if (state.index < state.items.length - 1) return { ...state, index: state.index + 1, startedAt: now };
  if (state.retryBuilt) return { ...state, phase: "complete" };
  // End of the first pass: one retry round, wrong auto-graded exercises only, in lesson order. Built once.
  const retries = state.items
    .filter((i) => i.attemptNo === 1 && i.step.supported && isRetryable(i.step.exercise.type) && state.answers[i.key]?.grade.correct === false)
    .map((i) => item(i.step, 2));
  if (retries.length === 0) return { ...state, retryBuilt: true, phase: "complete" };
  return { ...state, items: [...state.items, ...retries], index: state.index + 1, startedAt: now, retryBuilt: true };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  if (state.phase !== "playing") return state;
  const it = currentItem(state);
  if (action.key !== it.key) return state; // stale closure or double tap
  switch (action.type) {
    case "answer":
      if (!recordsAttempt(it) || it.key in state.answers) return state;
      return { ...state, answers: { ...state.answers, [it.key]: { answer: action.answer, grade: action.grade } } };
    case "next":
      return canAdvance(state) ? advance(state, action.now) : state;
    case "skip":
      return advance(state, action.now); // records nothing; a skipped exercise is not "wrong", so it is not retried
    case "broken": {
      const id = it.step.exercise.id;
      return { ...state, items: state.items.map((i) => (i.step.exercise.id === id ? { ...i, step: { ...i.step, supported: false } } : i)) };
    }
  }
}
