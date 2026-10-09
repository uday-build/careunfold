CREATE TABLE "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL,
  "image" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");
--> statement-breakpoint
CREATE TABLE "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");
--> statement-breakpoint
CREATE TABLE "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
--> statement-breakpoint
CREATE TABLE "household" (
  "id" uuid PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "origin" text NOT NULL DEFAULT 'user',
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "household_origin_check" CHECK ("origin" IN ('user', 'synthetic_fixture'))
);
--> statement-breakpoint
CREATE TABLE "household_membership" (
  "id" uuid PRIMARY KEY NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "admin_role" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "household_admin_role_check" CHECK ("admin_role" IN ('owner', 'admin', 'member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "household_membership_user_idx" ON "household_membership" ("household_id", "user_id");
--> statement-breakpoint
CREATE INDEX "household_membership_user_lookup_idx" ON "household_membership" ("user_id");
--> statement-breakpoint
CREATE TABLE "onboarding_state" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "household_id" uuid REFERENCES "household"("id") ON DELETE CASCADE,
  "organizing_for" text,
  "profile_completed_at" timestamptz,
  "family_completed_at" timestamptz,
  "coverage_completed_at" timestamptz,
  "review_completed_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "onboarding_organizing_for_check" CHECK ("organizing_for" IS NULL OR "organizing_for" IN ('self', 'someone_else', 'both'))
);
--> statement-breakpoint
CREATE TABLE "patient" (
  "id" uuid PRIMARY KEY NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "client_key" text NOT NULL,
  "given_name" text NOT NULL,
  "family_name" text NOT NULL,
  "preferred_name" text,
  "birth_date" date NOT NULL,
  "relationship" text NOT NULL,
  "authority_category" text NOT NULL,
  "profile_state" text NOT NULL,
  "linked_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "provenance" text NOT NULL DEFAULT 'account_holder_entered',
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "patient_authority_check" CHECK ("authority_category" IN ('self', 'adult_invitation', 'minor_representative', 'dependent_adult_representative')),
  CONSTRAINT "patient_state_check" CHECK ("profile_state" IN ('active', 'pending_invitation', 'pending_authority'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "patient_household_client_key_idx" ON "patient" ("household_id", "client_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "patient_one_self_per_household_idx" ON "patient" ("household_id") WHERE "authority_category" = 'self';
--> statement-breakpoint
CREATE INDEX "patient_household_idx" ON "patient" ("household_id");
--> statement-breakpoint
CREATE TABLE "access_grant" (
  "id" uuid PRIMARY KEY NOT NULL,
  "patient_id" uuid NOT NULL REFERENCES "patient"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "scopes" text[] NOT NULL,
  "authority_basis" text NOT NULL,
  "status" text NOT NULL,
  "granted_at" timestamptz,
  "revoked_at" timestamptz,
  "expires_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "access_grant_basis_check" CHECK ("authority_basis" IN ('self', 'invitation_accepted', 'representative_approved')),
  CONSTRAINT "access_grant_status_check" CHECK ("status" IN ('pending', 'active', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "access_grant_patient_user_idx" ON "access_grant" ("patient_id", "user_id");
--> statement-breakpoint
CREATE INDEX "access_grant_user_idx" ON "access_grant" ("user_id");
--> statement-breakpoint
CREATE TABLE "invitation" (
  "id" uuid PRIMARY KEY NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "patient_id" uuid NOT NULL REFERENCES "patient"("id") ON DELETE CASCADE,
  "invited_email" text NOT NULL,
  "requested_scopes" text[] NOT NULL,
  "token_hash" text UNIQUE,
  "status" text NOT NULL,
  "expires_at" timestamptz,
  "sent_at" timestamptz,
  "resolved_at" timestamptz,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "accepted_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "invitation_status_check" CHECK ("status" IN ('draft', 'sending', 'sent', 'send_failed', 'accepted', 'rejected', 'canceled', 'expired'))
);
--> statement-breakpoint
CREATE INDEX "invitation_patient_idx" ON "invitation" ("patient_id");
--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" ("invited_email");
--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_one_open_idx" ON "invitation" ("patient_id") WHERE "status" IN ('draft', 'sending', 'sent', 'send_failed');
--> statement-breakpoint
CREATE TABLE "authority_review" (
  "id" uuid PRIMARY KEY NOT NULL,
  "patient_id" uuid NOT NULL UNIQUE REFERENCES "patient"("id") ON DELETE CASCADE,
  "claimed_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "relationship_label" text NOT NULL,
  "claimed_authority" text NOT NULL,
  "status" text NOT NULL,
  "policy_reference" text,
  "decided_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "decided_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "authority_review_status_check" CHECK ("status" IN ('pending_review', 'approved', 'denied')),
  CONSTRAINT "authority_review_claim_check" CHECK ("claimed_authority" IN ('minor_representative', 'dependent_adult_representative'))
);
--> statement-breakpoint
CREATE TABLE "coverage" (
  "id" uuid PRIMARY KEY NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "client_key" text NOT NULL,
  "insurer" text,
  "plan_name" text,
  "subscriber_name" text,
  "subscriber_patient_id" uuid REFERENCES "patient"("id") ON DELETE SET NULL,
  "member_id" text,
  "group_number" text,
  "coverage_start" date,
  "coverage_end" date,
  "start_date_state" text NOT NULL,
  "end_date_state" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "coverage_start_state_check" CHECK ("start_date_state" IN ('known', 'unknown')),
  CONSTRAINT "coverage_end_state_check" CHECK ("end_date_state" IN ('known', 'unknown')),
  CONSTRAINT "coverage_start_consistency_check" CHECK (("start_date_state" = 'known') = ("coverage_start" IS NOT NULL)),
  CONSTRAINT "coverage_end_consistency_check" CHECK (("end_date_state" = 'known') = ("coverage_end" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_household_client_key_idx" ON "coverage" ("household_id", "client_key");
--> statement-breakpoint
CREATE TABLE "coverage_version" (
  "id" uuid PRIMARY KEY NOT NULL,
  "coverage_id" uuid NOT NULL REFERENCES "coverage"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_version_idx" ON "coverage_version" ("coverage_id", "version");
--> statement-breakpoint
CREATE TABLE "coverage_patient" (
  "coverage_id" uuid NOT NULL REFERENCES "coverage"("id") ON DELETE CASCADE,
  "patient_id" uuid NOT NULL REFERENCES "patient"("id") ON DELETE CASCADE,
  PRIMARY KEY ("coverage_id", "patient_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_patient_idx" ON "coverage_patient" ("coverage_id", "patient_id");
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "route" text NOT NULL,
  "key" text NOT NULL,
  "request_hash" text NOT NULL,
  "response_status" integer NOT NULL,
  "response_body" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_key_idx" ON "idempotency_key" ("user_id", "route", "key");
--> statement-breakpoint
CREATE TABLE "audit_event" (
  "id" uuid PRIMARY KEY NOT NULL,
  "actor_user_id" text,
  "household_id" uuid,
  "event_name" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_event_household_idx" ON "audit_event" ("household_id");
--> statement-breakpoint
CREATE TABLE "privacy_request" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "privacy_request_kind_check" CHECK ("kind" IN ('export', 'deletion')),
  CONSTRAINT "privacy_request_status_check" CHECK ("status" IN ('requested', 'in_review', 'completed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "account_preference" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "time_zone" text NOT NULL DEFAULT 'UTC',
  "locale" text NOT NULL DEFAULT 'en',
  "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_email_outbox" (
  "id" uuid PRIMARY KEY NOT NULL,
  "recipient" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "purpose" text NOT NULL,
  "created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_rate" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "action" text NOT NULL,
  "created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "action_rate_lookup_idx" ON "action_rate" ("user_id", "action", "created_at");
--> statement-breakpoint
CREATE TABLE "jurisdiction_policy" (
  "id" text PRIMARY KEY NOT NULL,
  "configured" boolean NOT NULL DEFAULT false,
  "jurisdiction_code" text,
  "review_age_years" integer,
  "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
INSERT INTO "jurisdiction_policy" ("id", "configured", "jurisdiction_code", "review_age_years", "updated_at")
VALUES ('default', false, NULL, NULL, now());
