ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "access_status" text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "access_reviewed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "access_reviewed_by_user_id" text;
--> statement-breakpoint
CREATE INDEX "user_access_status_idx" ON "user" ("access_status");
