CREATE TABLE "card_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"box" integer DEFAULT 1 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_result" text,
	"review_count" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"issue_note" text DEFAULT '' NOT NULL,
	"content_reviewed_at" timestamp with time zone,
	"content_reviewed_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_reviews_user_card_unique" UNIQUE("user_id","card_id"),
	CONSTRAINT "card_reviews_box_check" CHECK ("card_reviews"."box" between 1 and 5),
	CONSTRAINT "card_reviews_last_result_check" CHECK ("card_reviews"."last_result" in ('missed', 'hard', 'got-it'))
);
--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_reviews_user_due_idx" ON "card_reviews" USING btree ("user_id","due_at");