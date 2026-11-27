// The ONLY file that imports ts-fsrs (ESLint enforces it). Client-safe and pure: time comes in as a parameter, nothing
// is read from the clock, inputs are never changed.
//
// Configuration (explicit values from SRS_CONFIG in ./config, never library defaults):
//   algorithm FSRS-6 (ts-fsrs 6.0.1 defaults to FSRS-7), published FSRS-6 weights written out,
//   request retention 0.9, learning steps 1m and 10m, relearning steps 10m, short term on,
//   fuzz OFF, maximum interval 36500 days, graduating interval 1 day, allowModelOverride off.
//
// How DAYS are counted: ts-fsrs (fractionalDays off) counts a day as the difference between UTC calendar dates, so with
// Asia/Bangkok a card reviewed at 12:00 and again at 06:30 the next morning would be seen as a same-day review. The
// project's rule is that day boundaries come from `profiles.timezone`, so every instant is shifted to "local wall-clock
// written as UTC" (./zone) before it goes into the library. Then:
//   - the elapsed days FSRS uses, and the `elapsedDays` we store, are differences of LOCAL calendar dates;
//   - a due date of minutes (learning and relearning steps) is mapped back as the same real duration, across midnight and
//     across a DST change;
//   - a due date of one day or more is mapped back to the same local wall-clock time, as a real instant.
//
// The scheduler is built synchronously from ts-fsrs's building blocks (defineScheduler + the FSRS-6 model + the same
// middlewares DefaultScheduler uses) because DefaultScheduler() is async (it imports the model lazily) and a button
// label must be computed during render. scheduler.golden.test.ts compares the adapter with vectors generated from
// DefaultScheduler itself for the same configuration (scripts/srs-golden.mjs).
//
// Stored format: ts-fsrs 6 renamed the card fields (dueAt, lastReviewAt, learningStep) and dropped elapsed_days. Our
// own CardState keeps the names of the `srs_cards` columns; this file converts both ways.
import { dateChrono, defineScheduler, Rating as LibRating, type Grade } from "ts-fsrs";
import {
  schedulerDesiredRetentionMiddleware, schedulerFuzzingMiddleware, schedulerLearningStepsMiddleware, schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware, schedulerScheduledDaysMiddleware, schedulerStatsMiddleware,
} from "ts-fsrs/middlewares";
import { FSRS6Model } from "ts-fsrs/models/fsrs-6";
import { SRS_CONFIG } from "./config";
import { fromLocalWall, toLocalWall } from "./zone";

export const RATINGS = [1, 2, 3, 4] as const; // 1 Again, 2 Hard, 3 Good, 4 Easy
export type Rating = (typeof RATINGS)[number];

/** The Thai name of each button. A Record: adding a rating without a label is a compile error. */
export const RATING_LABEL_TH = { 1: "จำไม่ได้", 2: "ยาก", 3: "ได้", 4: "ง่าย" } as const satisfies Record<Rating, string>;

/** Names match the srs_cards columns (camelCase of the Drizzle fields). state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
export type CardState = {
  due: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  elapsedDays: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  lastReview: Date | null;
};

/** The jsonb in srs_reviews.state_before / state_after (docs/PROGRESS.md 2): snake_case, ISO strings. */
export type StoredCardState = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  last_review: string | null;
};

// The library wants a card id and a status word; neither is stored by us, so they are constants (no random ids).
const CARD_ID = "srs-card";
// the library has no separate status for Relearning: it reports "learning" (state 3) for it
const STATUS = ["new", "learning", "review", "learning"] as const;

const scheduler = defineScheduler({ model: FSRS6Model, chrono: dateChrono })
  .use(
    schedulerDesiredRetentionMiddleware, schedulerFuzzingMiddleware, schedulerStatsMiddleware, schedulerScheduledDaysMiddleware,
    schedulerLearningStepsMiddleware, schedulerMaximumIntervalMiddleware, schedulerMonotonicIntervalMiddleware,
  )
  .create({
    config: {
      fractionalDays: false,
      weights: [...SRS_CONFIG.weights],
      enableShortTerm: SRS_CONFIG.enableShortTerm,
      numRelearningSteps: SRS_CONFIG.relearningSteps.length,
      desiredRetention: SRS_CONFIG.desiredRetention,
      learningSteps: [...SRS_CONFIG.learningSteps],
      relearningSteps: [...SRS_CONFIG.relearningSteps],
      graduatingInterval: SRS_CONFIG.graduatingInterval,
      allowModelOverride: false,
      enableFuzz: SRS_CONFIG.enableFuzz,
      maximumInterval: SRS_CONFIG.maximumInterval,
      clearStatsOnForget: true,
    },
  });

/** What the library really runs with (for the test that pins the configuration). */
export const effectiveLibraryConfig = (): unknown => JSON.parse(JSON.stringify(scheduler.config));

export function newCardState(due: Date): CardState {
  return { due: new Date(due), stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, elapsedDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null };
}

function toLibrary(c: CardState, timeZone: string) {
  return {
    stability: c.stability, difficulty: c.difficulty, state: c.state, scheduleStatus: STATUS[c.state], dueAt: toLocalWall(c.due, timeZone),
    lastReviewAt: c.lastReview ? toLocalWall(c.lastReview, timeZone) : null, cardId: CARD_ID, reps: c.reps, lapses: c.lapses,
    scheduledDays: c.scheduledDays, learningStep: c.learningSteps,
  };
}

const GRADE: Record<Rating, Grade> = { 1: LibRating.Again, 2: LibRating.Hard, 3: LibRating.Good, 4: LibRating.Easy };

/** The one place a review is computed; applyRating and previewRatings both go through it, so they cannot disagree. */
function step(card: CardState, rating: Rating, now: Date, timeZone: string): CardState {
  const input = toLibrary(card, timeZone);
  const nowWall = toLocalWall(now, timeZone);
  // the day count FSRS itself uses for this review (a difference of local calendar dates), stored as elapsedDays
  const elapsedDays = input.lastReviewAt ? scheduler.chrono.difference(input.lastReviewAt, nowWall) : 0;
  const next = scheduler.review({ card: input, grade: GRADE[rating], now: nowWall }).card;
  const due = next.scheduledDays >= 1 ? fromLocalWall(next.dueAt, timeZone) : new Date(now.getTime() + (next.dueAt.getTime() - nowWall.getTime()));
  return {
    due, stability: next.stability, difficulty: next.difficulty, scheduledDays: next.scheduledDays, learningSteps: next.learningStep,
    elapsedDays, reps: next.reps, lapses: next.lapses, state: next.state as CardState["state"], lastReview: new Date(now),
  };
}

/** One review in the learner's time zone. Equal to previewRatings(card, now, timeZone)[rating]. */
export function applyRating(card: CardState, rating: Rating, now: Date, timeZone: string): CardState {
  return step(card, rating, now, timeZone);
}

/** The four possible results, without writing anything. */
export function previewRatings(card: CardState, now: Date, timeZone: string): Record<Rating, CardState> {
  return { 1: step(card, 1, now, timeZone), 2: step(card, 2, now, timeZone), 3: step(card, 3, now, timeZone), 4: step(card, 4, now, timeZone) };
}

export function toStoredState(c: CardState): StoredCardState {
  return {
    due: c.due.toISOString(), stability: c.stability, difficulty: c.difficulty, elapsed_days: c.elapsedDays, scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps, reps: c.reps, lapses: c.lapses, state: c.state, last_review: c.lastReview ? c.lastReview.toISOString() : null,
  };
}
