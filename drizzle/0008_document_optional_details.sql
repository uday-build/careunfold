ALTER TABLE "uploaded_document" ADD COLUMN "due_on" date;
--> statement-breakpoint
ALTER TABLE "uploaded_document" ADD COLUMN "stated_provider" text;
--> statement-breakpoint
ALTER TABLE "uploaded_document" ADD COLUMN "member_note" text;
