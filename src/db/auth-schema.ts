// The `user` table, shaped like Better Auth's core schema so that Better Auth (Milestone 2)
// can adopt it. session / account / verification are added together with Better Auth.
import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_email_lower_uidx").on(sql`lower(${t.email})`)],
);
