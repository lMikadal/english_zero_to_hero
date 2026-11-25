CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"day" integer NOT NULL,
	"skill" text NOT NULL,
	"exercise_type" text NOT NULL,
	"correct" boolean NOT NULL,
	"score" double precision,
	"duration_ms" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" text DEFAULT 'lesson' NOT NULL,
	"session_id" uuid,
	"answer" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_day_range" CHECK ("attempts"."day" BETWEEN 1 AND 365),
	CONSTRAINT "attempts_skill_valid" CHECK ("attempts"."skill" IN ('pronunciation', 'listening', 'speaking', 'reading', 'writing', 'vocabulary')),
	CONSTRAINT "attempts_source_valid" CHECK ("attempts"."source" IN ('lesson', 'drill', 'retest', 'checkpoint')),
	CONSTRAINT "attempts_duration_nonneg" CHECK ("attempts"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"start_date" date NOT NULL,
	"current_day" integer DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"accent" text DEFAULT 'us' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_current_day_range" CHECK ("profiles"."current_day" BETWEEN 1 AND 365),
	CONSTRAINT "profiles_accent_valid" CHECK ("profiles"."accent" IN ('us', 'uk'))
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"score" double precision,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "progress_day_range" CHECK ("progress"."day" BETWEEN 1 AND 365),
	CONSTRAINT "progress_status_valid" CHECK ("progress"."status" IN ('not_started', 'in_progress', 'done')),
	CONSTRAINT "progress_done_has_completed_at" CHECK ("progress"."status" <> 'done' OR "progress"."completed_at" IS NOT NULL)
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
	"day" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"object_key" text NOT NULL,
	"pron_score" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordings_day_range" CHECK ("recordings"."day" BETWEEN 1 AND 365)
);
--> statement-breakpoint
CREATE TABLE "reminder_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"remind_at" time DEFAULT '20:00' NOT NULL,
	"types" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_cards" (
	"user_id" text NOT NULL,
	"vocab_id" text NOT NULL,
	"direction" text NOT NULL,
	"due" timestamp with time zone DEFAULT now() NOT NULL,
	"stability" double precision DEFAULT 0 NOT NULL,
	"difficulty" double precision DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"learning_steps" smallint DEFAULT 0 NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" smallint DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "srs_cards_user_id_vocab_id_direction_pk" PRIMARY KEY("user_id","vocab_id","direction"),
	CONSTRAINT "srs_cards_reps_nonneg" CHECK ("srs_cards"."reps" >= 0),
	CONSTRAINT "srs_cards_lapses_nonneg" CHECK ("srs_cards"."lapses" >= 0),
	CONSTRAINT "srs_cards_state_range" CHECK ("srs_cards"."state" BETWEEN 0 AND 3),
	CONSTRAINT "srs_cards_scheduled_days_nonneg" CHECK ("srs_cards"."scheduled_days" >= 0),
	CONSTRAINT "srs_cards_learning_steps_nonneg" CHECK ("srs_cards"."learning_steps" >= 0),
	CONSTRAINT "srs_cards_elapsed_days_nonneg" CHECK ("srs_cards"."elapsed_days" >= 0),
	CONSTRAINT "srs_cards_direction_valid" CHECK ("srs_cards"."direction" IN ('en_th', 'th_en', 'listen_spell', 'speak'))
);
--> statement-breakpoint
CREATE TABLE "srs_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"vocab_id" text NOT NULL,
	"direction" text NOT NULL,
	"rating" smallint NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"duration_ms" integer,
	"state_before" jsonb,
	"state_after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "srs_reviews_rating_range" CHECK ("srs_reviews"."rating" BETWEEN 1 AND 4),
	CONSTRAINT "srs_reviews_duration_nonneg" CHECK ("srs_reviews"."duration_ms" >= 0),
	CONSTRAINT "srs_reviews_direction_valid" CHECK ("srs_reviews"."direction" IN ('en_th', 'th_en', 'listen_spell', 'speak'))
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"longest" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"freezes_left" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
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
ALTER TABLE "srs_reviews" ADD CONSTRAINT "srs_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_user_id_created_at_idx" ON "attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "attempts_user_id_exercise_id_idx" ON "attempts" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "attempts_user_id_skill_created_at_idx" ON "attempts" USING btree ("user_id","skill","created_at");--> statement-breakpoint
CREATE INDEX "attempts_user_id_source_created_at_idx" ON "attempts" USING btree ("user_id","source","created_at");--> statement-breakpoint
CREATE INDEX "attempts_tags_gin_idx" ON "attempts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "srs_cards_user_id_due_idx" ON "srs_cards" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "srs_reviews_user_id_reviewed_at_idx" ON "srs_reviews" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "srs_reviews_card_reviewed_at_idx" ON "srs_reviews" USING btree ("user_id","vocab_id","direction","reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_uidx" ON "user" USING btree (lower("email"));