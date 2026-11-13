CREATE TABLE "problem_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_slug" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"outcome" text NOT NULL,
	"failed_test" text,
	"stuck_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_attempts_outcome_check" CHECK ("problem_attempts"."outcome" in ('passed', 'failed')),
	CONSTRAINT "problem_attempts_duration_check" CHECK ("problem_attempts"."duration_seconds" >= 0),
	CONSTRAINT "problem_attempts_failed_test_check" CHECK ("problem_attempts"."outcome" = 'failed' or "problem_attempts"."failed_test" is null)
);
--> statement-breakpoint
ALTER TABLE "problem_attempts" ADD CONSTRAINT "problem_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_attempts_user_problem_idx" ON "problem_attempts" USING btree ("user_id","problem_slug","started_at");