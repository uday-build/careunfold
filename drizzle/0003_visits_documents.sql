CREATE TABLE "visit" (
  "id" uuid PRIMARY KEY NOT NULL,
  "patient_id" uuid NOT NULL REFERENCES "patient"("id") ON DELETE CASCADE,
  "household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "visit_date" date NOT NULL,
  "provider" text,
  "location" text,
  "reason" text,
  "status" text DEFAULT 'open' NOT NULL,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "visit_patient_idx" ON "visit" ("patient_id");
--> statement-breakpoint
CREATE INDEX "visit_household_idx" ON "visit" ("household_id");
--> statement-breakpoint
CREATE TABLE "uploaded_document" (
  "id" uuid PRIMARY KEY NOT NULL,
  "patient_id" uuid NOT NULL REFERENCES "patient"("id") ON DELETE CASCADE,
  "household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "original_filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "storage_bucket" text NOT NULL,
  "storage_path" text NOT NULL UNIQUE,
  "checksum_sha256" text NOT NULL,
  "status" text DEFAULT 'stored' NOT NULL,
  "uploaded_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "uploaded_document_patient_idx" ON "uploaded_document" ("patient_id");
--> statement-breakpoint
CREATE INDEX "uploaded_document_household_idx" ON "uploaded_document" ("household_id");
--> statement-breakpoint
CREATE TABLE "visit_document" (
  "visit_id" uuid NOT NULL REFERENCES "visit"("id") ON DELETE CASCADE,
  "document_id" uuid NOT NULL REFERENCES "uploaded_document"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "visit_document_idx" ON "visit_document" ("visit_id", "document_id");
