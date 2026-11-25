CREATE TABLE "coverage_document" (
  "coverage_id" uuid NOT NULL REFERENCES "coverage"("id") ON DELETE CASCADE,
  "document_id" uuid NOT NULL REFERENCES "uploaded_document"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_document_idx" ON "coverage_document" ("coverage_id", "document_id");
--> statement-breakpoint
ALTER TABLE "coverage_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY no_api_access ON "coverage_document" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  ELSE
    CREATE POLICY no_api_access ON "coverage_document" FOR ALL USING (false) WITH CHECK (false);
  END IF;
  REVOKE ALL ON TABLE "coverage_document" FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "coverage_document" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "coverage_document" FROM authenticated;
  END IF;
END $$;
