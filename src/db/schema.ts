// User data model: docs/ARCHITECTURE.md section 4. Change this file, then `make db-generate`.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
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

export const accentEnum = pgEnum("accent", ["us", "uk"]);
export const progressStatusEnum = pgEnum("progress_status", ["not_started", "in_progress", "done"]);
export const srsDirectionEnum = pgEnum("srs_direction", ["en_th", "th_en", "listen_spell", "speak"]);

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
    accent: accentEnum("accent").notNull().default("us"),
  },
  (t) => [check("profiles_current_day_range", sql`${t.currentDay} BETWEEN 1 AND 365`)],
);

export const progress = pgTable(
  "progress",
  {
    userId: userId(),
    day: integer("day").notNull(),
    status: progressStatusEnum("status").notNull().default("not_started"),
    score: real("score"),
    completedAt: tstz("completed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.day] }),
    check("progress_day_range", sql`${t.day} BETWEEN 1 AND 365`),
  ],
);

export const attempts = pgTable(
  "attempts",
  {
    // generated on the client so an offline queue can retry without double-writing
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    exerciseId: text("exercise_id").notNull(),
    correct: boolean("correct").notNull(),
    score: real("score"),
    answer: jsonb("answer"),
    createdAt: createdAt(),
  },
  (t) => [
    index("attempts_user_id_created_at_idx").on(t.userId, t.createdAt),
    index("attempts_user_id_exercise_id_idx").on(t.userId, t.exerciseId),
  ],
);

export const srsCards = pgTable(
  "srs_cards",
  {
    userId: userId(),
    vocabId: text("vocab_id").notNull(),
    direction: srsDirectionEnum("direction").notNull(),
    due: tstz("due").notNull().defaultNow(),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    // ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning
    state: smallint("state").notNull().default(0),
    lastReview: tstz("last_review"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.vocabId, t.direction] }),
    index("srs_cards_user_id_due_idx").on(t.userId, t.due),
    check("srs_cards_reps_nonneg", sql`${t.reps} >= 0`),
    check("srs_cards_lapses_nonneg", sql`${t.lapses} >= 0`),
    check("srs_cards_state_range", sql`${t.state} BETWEEN 0 AND 3`),
  ],
);

export const recordings = pgTable("recordings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  exerciseId: text("exercise_id").notNull(),
  objectKey: text("object_key").notNull(),
  pronScore: jsonb("pron_score"),
  createdAt: createdAt(),
});

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
});
