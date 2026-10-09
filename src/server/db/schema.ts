import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const authSchema = { user, session, account, verification };

export const household = pgTable("household", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  origin: text("origin").notNull().default("user"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const householdMembership = pgTable(
  "household_membership",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    adminRole: text("admin_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("household_membership_user_idx").on(table.householdId, table.userId),
    index("household_membership_user_lookup_idx").on(table.userId),
  ],
);

export const onboardingState = pgTable("onboarding_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  householdId: uuid("household_id").references(() => household.id, { onDelete: "cascade" }),
  organizingFor: text("organizing_for"),
  profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
  familyCompletedAt: timestamp("family_completed_at", { withTimezone: true }),
  coverageCompletedAt: timestamp("coverage_completed_at", { withTimezone: true }),
  reviewCompletedAt: timestamp("review_completed_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const patient = pgTable(
  "patient",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    clientKey: text("client_key").notNull(),
    givenName: text("given_name").notNull(),
    familyName: text("family_name").notNull(),
    preferredName: text("preferred_name"),
    birthDate: date("birth_date", { mode: "string" }).notNull(),
    relationship: text("relationship").notNull(),
    authorityCategory: text("authority_category").notNull(),
    profileState: text("profile_state").notNull(),
    linkedUserId: text("linked_user_id").references(() => user.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    provenance: text("provenance").notNull().default("account_holder_entered"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("patient_household_client_key_idx").on(table.householdId, table.clientKey),
    uniqueIndex("patient_one_self_per_household_idx")
      .on(table.householdId)
      .where(sql`${table.authorityCategory} = 'self'`),
    index("patient_household_idx").on(table.householdId),
  ],
);

export const accessGrant = pgTable(
  "access_grant",
  {
    id: uuid("id").primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").array().notNull(),
    authorityBasis: text("authority_basis").notNull(),
    status: text("status").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("access_grant_patient_user_idx").on(table.patientId, table.userId),
    index("access_grant_user_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email").notNull(),
    requestedScopes: text("requested_scopes").array().notNull(),
    tokenHash: text("token_hash").unique(),
    status: text("status").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("invitation_patient_idx").on(table.patientId),
    index("invitation_email_idx").on(table.invitedEmail),
    uniqueIndex("invitation_one_open_idx")
      .on(table.patientId)
      .where(sql`${table.status} in ('draft', 'sending', 'sent', 'send_failed')`),
  ],
);

export const authorityReview = pgTable("authority_review", {
  id: uuid("id").primaryKey(),
  patientId: uuid("patient_id")
    .notNull()
    .unique()
    .references(() => patient.id, { onDelete: "cascade" }),
  claimedByUserId: text("claimed_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  relationshipLabel: text("relationship_label").notNull(),
  claimedAuthority: text("claimed_authority").notNull(),
  status: text("status").notNull(),
  policyReference: text("policy_reference"),
  decidedByUserId: text("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const coverage = pgTable(
  "coverage",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    clientKey: text("client_key").notNull(),
    insurer: text("insurer"),
    planName: text("plan_name"),
    subscriberName: text("subscriber_name"),
    subscriberPatientId: uuid("subscriber_patient_id").references(() => patient.id, { onDelete: "set null" }),
    memberId: text("member_id"),
    groupNumber: text("group_number"),
    coverageStart: date("coverage_start", { mode: "string" }),
    coverageEnd: date("coverage_end", { mode: "string" }),
    startDateState: text("start_date_state").notNull(),
    endDateState: text("end_date_state").notNull(),
    version: integer("version").notNull().default(1),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("coverage_household_client_key_idx").on(table.householdId, table.clientKey)],
);

export const coverageVersion = pgTable(
  "coverage_version",
  {
    id: uuid("id").primaryKey(),
    coverageId: uuid("coverage_id")
      .notNull()
      .references(() => coverage.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("coverage_version_idx").on(table.coverageId, table.version)],
);

export const coveragePatient = pgTable(
  "coverage_patient",
  {
    coverageId: uuid("coverage_id")
      .notNull()
      .references(() => coverage.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("coverage_patient_idx").on(table.coverageId, table.patientId)],
);

export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    route: text("route").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("idempotency_key_idx").on(table.userId, table.route, table.key)],
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    householdId: uuid("household_id"),
    eventName: text("event_name").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("audit_event_household_idx").on(table.householdId)],
);

export const privacyRequest = pgTable("privacy_request", {
  id: uuid("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const accountPreference = pgTable("account_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  timeZone: text("time_zone").notNull().default("UTC"),
  locale: text("locale").notNull().default("en"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const devEmailOutbox = pgTable("dev_email_outbox", {
  id: uuid("id").primaryKey(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  purpose: text("purpose").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const actionRate = pgTable(
  "action_rate",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("action_rate_lookup_idx").on(table.userId, table.action, table.createdAt)],
);

export const jurisdictionPolicy = pgTable("jurisdiction_policy", {
  id: text("id").primaryKey(),
  configured: boolean("configured").notNull().default(false),
  jurisdictionCode: text("jurisdiction_code"),
  reviewAgeYears: integer("review_age_years"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const schema = {
  user,
  session,
  account,
  verification,
  household,
  householdMembership,
  onboardingState,
  patient,
  accessGrant,
  invitation,
  authorityReview,
  coverage,
  coverageVersion,
  coveragePatient,
  idempotencyKey,
  auditEvent,
  privacyRequest,
  accountPreference,
  devEmailOutbox,
  actionRate,
  jurisdictionPolicy,
  userRelations,
  sessionRelations,
  accountRelations,
};
