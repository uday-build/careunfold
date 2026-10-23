ALTER TABLE "coverage" ADD COLUMN "benefits" jsonb;
--> statement-breakpoint
ALTER TABLE "authority_review" ADD COLUMN "requested_scopes" text[] DEFAULT ARRAY['profile.read','coverage.read','records.read']::text[] NOT NULL;
