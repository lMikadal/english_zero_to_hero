// User data model: docs/ARCHITECTURE.md section 4. Change this file, then `make db-generate`.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { CheckpointSkillResult } from "@/lib/attempts/contract"; // type-only: erased, the DB layer takes no runtime import from lib/
import { user } from "./auth-schema";

export * from "./auth-schema";

const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const tstz = (name: string) => timestamp(name, { withTimezone: true });

// Closed value sets are `text` + CHECK (not pg enums): adding a value later is a one-line
// constraint change instead of ALTER TYPE. The `as const` arrays keep the TS types narrow.
export const ACCENTS = ["us", "uk"] as const;
export const PROGRESS_STATUSES = ["not_started", "in_progress", "done"] as const;
export const SRS_DIRECTIONS = ["en_th", "th_en", "listen_spell", "speak"] as const;
export const SKILLS = ["pronunciation", "listening", "speaking", "reading", "writing", "vocabulary"] as const;
// checkpoint = the first answer a learner ever gives to a checkpoint exercise; checkpoint_retake = every later answer to it
// (a second sitting, or a sitting that was dropped and started again). Which of the two is stored is decided by the server.
export const ATTEMPT_SOURCES = ["lesson", "drill", "retest", "checkpoint", "practice", "checkpoint_retake"] as const;
export const ACTIVITY_SOURCES = ["lesson", "practice", "review", "checkpoint"] as const;
export type Accent = (typeof ACCENTS)[number];
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export type SrsDirection = (typeof SRS_DIRECTIONS)[number];
export type Skill = (typeof SKILLS)[number];
export type AttemptSource = (typeof ATTEMPT_SOURCES)[number];
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

const inList = (column: unknown, values: readonly string[]) =>
  sql`${column} IN (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const tags = () => text("tags").array().notNull().default(sql`'{}'::text[]`);

export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    startDate: date("start_date").notNull(),
    currentDay: integer("current_day").notNull().default(1),
    timezone: text("timezone").notNull().default("Asia/Bangkok"),
    accent: text("accent").$type<Accent>().notNull().default("us"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("profiles_current_day_range", sql`${t.currentDay} BETWEEN 1 AND 365`),
    check("profiles_accent_valid", inList(t.accent, ACCENTS)),
  ],
);

export const progress = pgTable(
  "progress",
  {
    userId: userId(),
    day: integer("day").notNull(),
    status: text("status").$type<ProgressStatus>().notNull().default("not_started"),
    score: doublePrecision("score"),
    startedAt: tstz("started_at"),
    completedAt: tstz("completed_at"),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.day] }),
    check("progress_day_range", sql`${t.day} BETWEEN 1 AND 365`),
    check("progress_status_valid", inList(t.status, PROGRESS_STATUSES)),
    check("progress_done_has_completed_at", sql`${t.status} <> 'done' OR ${t.completedAt} IS NOT NULL`),
  ],
);

export const attempts = pgTable(
  "attempts",
  {
    // generated on the client so an offline queue can retry without double-writing
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    exerciseId: text("exercise_id").notNull(),
    day: integer("day").notNull(),
    skill: text("skill").$type<Skill>().notNull(),
    exerciseType: text("exercise_type").notNull(),
    correct: boolean("correct").notNull(),
    score: doublePrecision("score"),
    durationMs: integer("duration_ms"),
    // what the exercise practised, e.g. `phoneme:ae`, `vocab:v-cat` (docs/PROGRESS.md section 1)
    tags: tags(),
    source: text("source").$type<AttemptSource>().notNull().default("lesson"),
    sessionId: uuid("session_id"),
    // 1 = first try (counts for scores), 2 = the end-of-lesson retry round
    attemptNo: smallint("attempt_no").notNull().default(1),
    answer: jsonb("answer"),
    createdAt: createdAt(),
  },
  (t) => [
    index("attempts_user_id_created_at_idx").on(t.userId, t.createdAt),
    index("attempts_user_id_exercise_id_idx").on(t.userId, t.exerciseId),
    index("attempts_user_id_skill_created_at_idx").on(t.userId, t.skill, t.createdAt),
    index("attempts_user_id_source_created_at_idx").on(t.userId, t.source, t.createdAt),
    index("attempts_user_id_day_idx").on(t.userId, t.day),
    index("attempts_user_id_session_id_idx").on(t.userId, t.sessionId),
    index("attempts_tags_gin_idx").using("gin", t.tags),
    check("attempts_day_range", sql`${t.day} BETWEEN 1 AND 365`),
    check("attempts_skill_valid", inList(t.skill, SKILLS)),
    check("attempts_source_valid", inList(t.source, ATTEMPT_SOURCES)),
    check("attempts_duration_nonneg", sql`${t.durationMs} >= 0`),
    check("attempts_attempt_no_range", sql`${t.attemptNo} BETWEEN 1 AND 2`),
  ],
);

// One row per finished sitting of a monthly checkpoint (docs/plans/checkpoint-plan.md 4.2). The score is frozen at
// completion, so editing the exam file later never changes an old result. `passed` is not stored: isCheckpointPass(score).
export const checkpointResults = pgTable(
  "checkpoint_results",
  {
    // the sitting's sessionId, generated on the client, so completing twice cannot write twice
    id: uuid("id").primaryKey(),
    userId: userId(),
    afterDay: integer("after_day").notNull(),
    score: doublePrecision("score").notNull(),
    skills: jsonb("skills").$type<CheckpointSkillResult[]>().notNull(),
    startedAt: tstz("started_at").notNull(),
    completedAt: tstz("completed_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("checkpoint_results_user_after_day_idx").on(t.userId, t.afterDay, t.completedAt),
    check("checkpoint_results_after_day_valid", sql`${t.afterDay} BETWEEN 30 AND 360 AND ${t.afterDay} % 30 = 0`),
    check("checkpoint_results_score_range", sql`${t.score} BETWEEN 0 AND 1`),
    check("checkpoint_results_times", sql`${t.completedAt} >= ${t.startedAt}`),
  ],
);

export const srsCards = pgTable(
  "srs_cards",
  {
    userId: userId(),
    vocabId: text("vocab_id").notNull(),
    direction: text("direction").$type<SrsDirection>().notNull(),
    due: tstz("due").notNull().defaultNow(),
    stability: doublePrecision("stability").notNull().default(0),
    difficulty: doublePrecision("difficulty").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: smallint("learning_steps").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    // FSRS state: 0 New, 1 Learning, 2 Review, 3 Relearning (the CHECK below keeps it in range)
    state: smallint("state").$type<0 | 1 | 2 | 3>().notNull().default(0),
    lastReview: tstz("last_review"),
    // when the row was created (migration 0004; rows that existed then got the migration time)
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.vocabId, t.direction] }),
    index("srs_cards_user_id_due_idx").on(t.userId, t.due),
    check("srs_cards_reps_nonneg", sql`${t.reps} >= 0`),
    check("srs_cards_lapses_nonneg", sql`${t.lapses} >= 0`),
    check("srs_cards_state_range", sql`${t.state} BETWEEN 0 AND 3`),
    check("srs_cards_scheduled_days_nonneg", sql`${t.scheduledDays} >= 0`),
    check("srs_cards_learning_steps_nonneg", sql`${t.learningSteps} >= 0`),
    check("srs_cards_elapsed_days_nonneg", sql`${t.elapsedDays} >= 0`),
    check("srs_cards_stability_nonneg", sql`${t.stability} >= 0`),
    check("srs_cards_difficulty_nonneg", sql`${t.difficulty} >= 0`),
    check("srs_cards_direction_valid", inList(t.direction, SRS_DIRECTIONS)),
  ],
);

// One row per review, written by the client with its own id (idempotent sync).
export const srsReviews = pgTable(
  "srs_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    vocabId: text("vocab_id").notNull(),
    direction: text("direction").$type<SrsDirection>().notNull(),
    rating: smallint("rating").notNull(),
    reviewedAt: tstz("reviewed_at").notNull(),
    durationMs: integer("duration_ms"),
    stateBefore: jsonb("state_before"),
    stateAfter: jsonb("state_after").notNull(),
    // one review session (the client's id), so "reviewed at least once in this session" is a query; null for older rows
    sessionId: uuid("session_id"),
    createdAt: createdAt(),
  },
  (t) => [
    // a review always belongs to a card of the same user, word and direction (deleting the card deletes its reviews)
    foreignKey({
      name: "srs_reviews_card_fk",
      columns: [t.userId, t.vocabId, t.direction],
      foreignColumns: [srsCards.userId, srsCards.vocabId, srsCards.direction],
    }).onDelete("cascade"),
    index("srs_reviews_user_id_session_id_idx").on(t.userId, t.sessionId),
    index("srs_reviews_user_id_reviewed_at_idx").on(t.userId, t.reviewedAt),
    index("srs_reviews_card_reviewed_at_idx").on(t.userId, t.vocabId, t.direction, t.reviewedAt),
    check("srs_reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 4`),
    check("srs_reviews_duration_nonneg", sql`${t.durationMs} >= 0`),
    check("srs_reviews_direction_valid", inList(t.direction, SRS_DIRECTIONS)),
  ],
);

export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    exerciseId: text("exercise_id").notNull(),
    day: integer("day"),
    tags: tags(),
    objectKey: text("object_key").notNull(),
    pronScore: jsonb("pron_score"),
    createdAt: createdAt(),
  },
  (t) => [check("recordings_day_range", sql`${t.day} BETWEEN 1 AND 365`)],
);

export const streaks = pgTable(
  "streaks",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    current: integer("current").notNull().default(0),
    longest: integer("longest").notNull().default(0),
    lastActiveDate: date("last_active_date"),
    freezesLeft: integer("freezes_left").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("streaks_current_nonneg", sql`${t.current} >= 0`),
    check("streaks_longest_nonneg", sql`${t.longest} >= 0`),
    check("streaks_freezes_left_nonneg", sql`${t.freezesLeft} >= 0`),
  ],
);

// One row per user and local calendar day with learning activity; the streak is derived from it, so it does not
// depend on the order in which days sync (a late offline day still lands in the right place).
export const activityDays = pgTable(
  "activity_days",
  {
    userId: userId(),
    localDate: date("local_date").notNull(),
    source: text("source").$type<ActivitySource>().notNull().default("lesson"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] }), check("activity_days_source_valid", inList(t.source, ACTIVITY_SOURCES))],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
});

export const reminderSettings = pgTable("reminder_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  remindAt: time("remind_at").notNull().default("20:00"),
  types: text("types").array().notNull().default(sql`'{}'::text[]`),
  updatedAt: updatedAt(),
});
