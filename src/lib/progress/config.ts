// Every threshold from docs/PROGRESS.md in one place. Tune here only.

export const DAY_MS = 86_400_000;

// 2. Known words
export const REMEMBERED_STABILITY_DAYS = 7;
export const KNOWN_STABILITY_DAYS = 21;
/** FSRS ratings 2 (Hard), 3 (Good), 4 (Easy) count as recalled; 1 (Again) is a miss. */
export const MIN_CORRECT_RATING = 2;
export const RETENTION_WINDOW_DAYS = 30;
/** ts-fsrs State: reviews of cards in Review (2) or Relearning (3) count towards retention. */
export const MIN_GRADUATED_STATE = 2;
export const OFTEN_FORGOTTEN_LAPSES = 3;
export const OXFORD_3000_SIZE = 3000;

// 3. Weak points
export const WEAKNESS_WINDOW_DAYS = 14;
export const WEIGHT_HALF_LIFE_DAYS = 7;
export const MIN_ATTEMPTS = 5;
export const WEAK_ERROR_RATE = 0.3;
export const RECOVERED_ERROR_RATE = 0.15;
export const TOP_WEAKNESSES_PER_ANGLE = 5;
/** Attempt sources that count as evidence of a weakness. drill/retest are excluded (3.1). */
export const DETECTION_SOURCES = ["lesson", "checkpoint"] as const;

// 3.1 Drills
export const RETEST_PASS_RATE = 0.8;
export const RETEST_PASSES_TO_FIX = 2;
export const MAX_DRILLS_PER_DAY = 2;
/** A retest session needs at least this many graded (score not null) attempts to be able to pass. */
export const MIN_RETEST_GRADED_ATTEMPTS = 5;

// 4. CEFR
export const CHECKPOINT_PASS_SCORE = 0.7;
export const CEFR_REQUIREMENTS = [
  { level: "A1", checkpointDay: 60, minKnownWords: 400 },
  { level: "A2", checkpointDay: 150, minKnownWords: 1200 },
  { level: "B1", checkpointDay: 270, minKnownWords: 1840 },
  { level: "B2", checkpointDay: 360, minKnownWords: 2400 },
] as const;

// 5. Pace
export const COURSE_DAYS = 365;
export const PACE_WINDOW_DAYS = 14;
export const SLIGHTLY_BEHIND_MAX_DAYS = 3;
export const DEFAULT_TIME_ZONE = "Asia/Bangkok";
