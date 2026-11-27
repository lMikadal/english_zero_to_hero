// Every number that shapes the vocabulary review, in one place. Client-safe: no imports.
// The scheduler configuration is explicit on purpose: nothing is left to a ts-fsrs default, so a library upgrade
// cannot change the schedule silently (scheduler.test.ts pins these values and what the library really runs with).

export const SRS_CONFIG = {
  /** The model. ts-fsrs 6 defaults to FSRS-7; we choose FSRS-6 (published default weights, see docs/plans/vocab-review-plan.md 4.1). */
  algorithm: "FSRS-6",
  /** Target recall at the moment a card is due (docs/PROGRESS.md: about 90%). */
  desiredRetention: 0.9,
  enableShortTerm: true,
  /** New and learning cards: 1 minute, then 10 minutes. */
  learningSteps: ["1m", "10m"],
  /** A forgotten Review card: 10 minutes (design image 24, "จำไม่ได้ 10 นาที"). */
  relearningSteps: ["10m"],
  /** Days for a card that graduates from the steps with Good. */
  graduatingInterval: 1,
  /** Off: the interval under a button is exactly what happens, and the tests are deterministic. */
  enableFuzz: false,
  /** Days. */
  maximumInterval: 36500,
  /** FSRS-6 default weights (w0..w20), written out so they cannot change with the library. */
  weights: [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542],
} as const;

/** The second card of a new word (th_en) starts this many calendar days after the first (en_th). */
export const SIBLING_STAGGER_DAYS = 1;
/** Two cards of the same word are at least this many positions apart in a session (so at least 3 cards between them). */
export const SIBLING_GAP = 4;
/** A card that is still due today after a rating comes back after this many other cards. */
export const REQUEUE_GAP = 3;
/**
 * A Learning or Relearning card answered again less than this long after its last review is the SAME SESSION: the elapsed
 * days are 0 even when local midnight lies between the two answers (23:55 then 00:05). Longer gaps, and Review cards, count
 * local calendar days. Without this, a card graduating across midnight would be given the long-term formula (~7 days, not ~2).
 */
export const SAME_SESSION_MAX_MS = 4 * 60 * 60 * 1000;
