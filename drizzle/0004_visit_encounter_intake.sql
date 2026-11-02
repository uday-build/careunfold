ALTER TABLE "visit" ADD COLUMN "start_time" text;
--> statement-breakpoint
ALTER TABLE "visit" ADD COLUMN "provider_role" text;
--> statement-breakpoint
ALTER TABLE "visit" ADD COLUMN "modality" text;
--> statement-breakpoint
ALTER TABLE "visit" ADD COLUMN "chief_complaint" text;
--> statement-breakpoint
ALTER TABLE "visit" ADD COLUMN "allergies" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "visit" ADD COLUMN "medications" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE "household_clinician" (
  "id" uuid PRIMARY KEY NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "display_name" text NOT NULL,
  "role" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "household_clinician_household_idx" ON "household_clinician" ("household_id");
