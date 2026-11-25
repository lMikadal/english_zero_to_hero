CREATE TABLE "activity_days" (
	"user_id" text NOT NULL,
	"local_date" date NOT NULL,
	"source" text DEFAULT 'lesson' NOT NULL,
	CONSTRAINT "activity_days_user_id_local_date_pk" PRIMARY KEY("user_id","local_date")
);
--> statement-breakpoint
ALTER TABLE "activity_days" ADD CONSTRAINT "activity_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_user_id_day_idx" ON "attempts" USING btree ("user_id","day");