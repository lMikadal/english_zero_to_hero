// User data model: docs/ARCHITECTURE.md section 4. Change this file, then `make db-generate`.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
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
export const ATTEMPT_SOURCES = ["lesson", "drill", "retest", "checkpoint"] as const;
export type Accent = (typeof ACCENTS)[number];
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export type SrsDirection = (typeof SRS_DIRECTIONS)[number];
export type Skill = (typeof SKILLS)[number];
export type AttemptSource = (typeof ATTEMPT_SOURCES)[number];

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
    answer: jsonb("answer"),
    createdAt: createdAt(),
  },
  (t) => [
    index("attempts_user_id_created_at_idx").on(t.userId, t.createdAt),
    index("attempts_user_id_exercise_id_idx").on(t.userId, t.exerciseId),
    index("attempts_user_id_skill_created_at_idx").on(t.userId, t.skill, t.createdAt),
    index("attempts_user_id_source_created_at_idx").on(t.userId, t.source, t.createdAt),
    index("attempts_tags_gin_idx").using("gin", t.tags),
    check("attempts_day_range", sql`${t.day} BETWEEN 1 AND 365`),
    check("attempts_skill_valid", inList(t.skill, SKILLS)),
    check("attempts_source_valid", inList(t.source, ATTEMPT_SOURCES)),
    check("attempts_duration_nonneg", sql`${t.durationMs} >= 0`),
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
    // ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning
    state: smallint("state").notNull().default(0),
    lastReview: tstz("last_review"),
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
    createdAt: createdAt(),
  },
  (t) => [
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
