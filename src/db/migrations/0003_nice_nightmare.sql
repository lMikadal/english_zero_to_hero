ALTER TABLE "attempts" DROP CONSTRAINT "attempts_source_valid";--> statement-breakpoint
CREATE INDEX "attempts_user_id_session_id_idx" ON "attempts" USING btree ("user_id","session_id");--> statement-breakpoint
ALTER TABLE "activity_days" ADD CONSTRAINT "activity_days_source_valid" CHECK ("activity_days"."source" IN ('lesson', 'practice'));--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_source_valid" CHECK ("attempts"."source" IN ('lesson', 'drill', 'retest', 'checkpoint', 'practice'));