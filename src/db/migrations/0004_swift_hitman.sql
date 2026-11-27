ALTER TABLE "activity_days" DROP CONSTRAINT "activity_days_source_valid";--> statement-breakpoint
ALTER TABLE "srs_cards" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "srs_reviews" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "srs_reviews" ADD CONSTRAINT "srs_reviews_card_fk" FOREIGN KEY ("user_id","vocab_id","direction") REFERENCES "public"."srs_cards"("user_id","vocab_id","direction") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "srs_reviews_user_id_session_id_idx" ON "srs_reviews" USING btree ("user_id","session_id");--> statement-breakpoint
ALTER TABLE "activity_days" ADD CONSTRAINT "activity_days_source_valid" CHECK ("activity_days"."source" IN ('lesson', 'practice', 'review'));--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_stability_nonneg" CHECK ("srs_cards"."stability" >= 0);--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_difficulty_nonneg" CHECK ("srs_cards"."difficulty" >= 0);