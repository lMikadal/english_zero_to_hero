CREATE TABLE "checkpoint_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"after_day" integer NOT NULL,
	"score" double precision NOT NULL,
	"skills" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkpoint_results_after_day_valid" CHECK ("checkpoint_results"."after_day" BETWEEN 30 AND 360 AND "checkpoint_results"."after_day" % 30 = 0),
	CONSTRAINT "checkpoint_results_score_range" CHECK ("checkpoint_results"."score" BETWEEN 0 AND 1),
	CONSTRAINT "checkpoint_results_times" CHECK ("checkpoint_results"."completed_at" >= "checkpoint_results"."started_at")
);
--> statement-breakpoint
ALTER TABLE "activity_days" DROP CONSTRAINT "activity_days_source_valid";--> statement-breakpoint
ALTER TABLE "attempts" DROP CONSTRAINT "attempts_source_valid";--> statement-breakpoint
ALTER TABLE "checkpoint_results" ADD CONSTRAINT "checkpoint_results_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkpoint_results_user_after_day_idx" ON "checkpoint_results" USING btree ("user_id","after_day","completed_at");--> statement-breakpoint
ALTER TABLE "activity_days" ADD CONSTRAINT "activity_days_source_valid" CHECK ("activity_days"."source" IN ('lesson', 'practice', 'review', 'checkpoint'));--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_source_valid" CHECK ("attempts"."source" IN ('lesson', 'drill', 'retest', 'checkpoint', 'practice', 'checkpoint_retake'));