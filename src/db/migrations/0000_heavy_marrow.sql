CREATE TYPE "public"."accent" AS ENUM('us', 'uk');--> statement-breakpoint
CREATE TYPE "public"."progress_status" AS ENUM('not_started', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."srs_direction" AS ENUM('en_th', 'th_en', 'listen_spell', 'speak');--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"correct" boolean NOT NULL,
	"score" real,
	"answer" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"start_date" date NOT NULL,
	"current_day" integer DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"accent" "accent" DEFAULT 'us' NOT NULL,
	CONSTRAINT "profiles_current_day_range" CHECK ("profiles"."current_day" BETWEEN 1 AND 365)
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"status" "progress_status" DEFAULT 'not_started' NOT NULL,
	"score" real,
	"completed_at" timestamp with time zone,
	CONSTRAINT "progress_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "progress_day_range" CHECK ("progress"."day" BETWEEN 1 AND 365)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"object_key" text NOT NULL,
	"pron_score" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"remind_at" time DEFAULT '20:00' NOT NULL,
	"types" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_cards" (
	"user_id" text NOT NULL,
	"vocab_id" text NOT NULL,
	"direction" "srs_direction" NOT NULL,
	"due" timestamp with time zone DEFAULT now() NOT NULL,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" smallint DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	CONSTRAINT "srs_cards_user_id_vocab_id_direction_pk" PRIMARY KEY("user_id","vocab_id","direction"),
	CONSTRAINT "srs_cards_reps_nonneg" CHECK ("srs_cards"."reps" >= 0),
	CONSTRAINT "srs_cards_lapses_nonneg" CHECK ("srs_cards"."lapses" >= 0),
	CONSTRAINT "srs_cards_state_range" CHECK ("srs_cards"."state" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"longest" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"freezes_left" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "streaks_current_nonneg" CHECK ("streaks"."current" >= 0),
	CONSTRAINT "streaks_longest_nonneg" CHECK ("streaks"."longest" >= 0),
	CONSTRAINT "streaks_freezes_left_nonneg" CHECK ("streaks"."freezes_left" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_user_id_created_at_idx" ON "attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "attempts_user_id_exercise_id_idx" ON "attempts" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "srs_cards_user_id_due_idx" ON "srs_cards" USING btree ("user_id","due");