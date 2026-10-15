import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assessAgeTransition, authorizeQueuedRecordJob, loadJurisdictionPolicy } from "@/server/domain/access";
import { createAuth } from "@/server/auth/create-auth";
import { account, user } from "@/server/db/schema";
import { clearMemoryMailbox, createEmailSender, readMemoryMailbox } from "@/server/email/delivery";
import { applyMigrations } from "@/server/db/client";
import { reduceForm } from "@/lib/form-state";
import path from "node:path";
import {
  adultPatient,
  api,
  authRequest,
  cookiesFrom,
  createTestContext,
  jsonRequest,
  linkFromMailbox,
  origin,
  password,
  register,
  resetData,
  saveProfile,
  selfPatient,
  signIn,
  tokenFromMailbox,
} from "./support";
import type { AppContext } from "@/server/domain/service";

let ctx: AppContext;
let closeDatabase: () => Promise<void>;
let setNow: (value: Date) => void;
let getNow: () => Date;

beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "pglite:memory",
    BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars",
    BETTER_AUTH_URL: origin,
    EMAIL_DELIVERY: "memory",
  });
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  const harness = await createTestContext();
  ctx = harness.ctx;
  closeDatabase = harness.close;
  setNow = harness.setNow;
  getNow = harness.getNow;
});

beforeEach(async () => {
  setNow(new Date("2026-10-08T15:00:00.000Z"));
  await resetData(ctx);
});

afterAll(async () => {
  await closeDatabase();
});

describe("increment A", () => {
  it("A01 registers one verified user and resumes onboarding", async () => {
    const created = await register(ctx, "a01@example.com");
    expect(created.signUp.status).toBe(200);
    expect(created.signUpBody.token).toBeNull();
    const onboarding = await api(ctx, "/api/onboarding", { cookie: created.cookie });
    expect(onboarding.status).toBe(200);
    expect(onboarding.data.onboarding.currentStep).toBe("profile");
    const users = await ctx.db.select().from(user);
    expect(users).toHaveLength(1);
    expect(users[0]?.emailVerified).toBe(true);
    const credentials = await ctx.db.select().from(account);
    expect(credentials[0]?.password).toBeTruthy();
    expect(credentials[0]?.password).not.toBe(password);
    expect(credentials[0]?.password?.includes(password)).toBe(false);
  });

  it("A02 does not duplicate an account or disclose that the email exists", async () => {
    const first = await authRequest(ctx, "/sign-up/email", {
      body: { name: "", email: "a02@example.com", password, callbackURL: "/verify-email" },
    });
    const firstBody = await first.json();
    clearMemoryMailbox();
    const second = await authRequest(ctx, "/sign-up/email", {
      body: { name: "", email: "a02@example.com", password, callbackURL: "/verify-email" },
    });
    const secondBody = await second.json();
    expect(first.status).toBe(second.status);
    expect(secondBody.token).toBeNull();
    expect(JSON.stringify(secondBody).toLowerCase()).not.toContain("already");
    expect(JSON.stringify(secondBody).toLowerCase()).not.toContain("exists");
    const users = await ctx.db.select().from(user);
    expect(users).toHaveLength(1);
    expect(users[0]?.id).toBe(firstBody.user.id);
    expect(readMemoryMailbox().some((message) => message.purpose === "existing_account")).toBe(true);
  });

  it("A03 keeps Google cancel and missing configuration from creating or linking accounts", async () => {
    const missing = createAuth({
      db: ctx.db,
      env: { ...ctx.env, googleEnabled: false, googleClientId: null, googleClientSecret: null },
      email: ctx.email,
    });
    const denied = await missing.handler(
      jsonRequest("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/auth/continue",
        errorCallbackURL: "/sign-in",
        disableRedirect: true,
      }),
    );
    expect(denied.status).toBe(404);
    expect((await denied.json()).code).toBe("PROVIDER_NOT_FOUND");
    expect(await ctx.db.select().from(user)).toHaveLength(0);

    const googleAuth = createAuth({
      db: ctx.db,
      env: {
        ...ctx.env,
        googleEnabled: true,
        googleClientId: "test-client.apps.googleusercontent.com",
        googleClientSecret: "test-secret",
      },
      email: ctx.email,
    });
    await register(ctx, "a03@example.com");
    const started = await googleAuth.handler(
      jsonRequest("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/auth/continue",
        errorCallbackURL: "/sign-in",
        disableRedirect: true,
      }),
    );
    const startedBody = await started.json();
    const authorizationUrl = new URL(startedBody.url as string);
    expect((authorizationUrl.searchParams.get("scope") ?? "").split(" ").sort()).toEqual(["email", "openid", "profile"]);
    expect(authorizationUrl.searchParams.get("include_granted_scopes")).not.toBe("true");
    const state = authorizationUrl.searchParams.get("state");
    const canceled = await googleAuth.handler(
      new Request(`${origin}/api/auth/callback/google?error=access_denied&state=${state}`, { headers: { origin } }),
    );
    expect(canceled.status).toBeGreaterThanOrEqual(300);
    expect(canceled.status).toBeLessThan(400);
    expect(canceled.headers.get("location")).toContain("/sign-in");
    expect(canceled.headers.get("set-cookie") ?? "").not.toContain("session_token=");
    expect(await ctx.db.select().from(user)).toHaveLength(1);
    expect((await ctx.db.select().from(account)).map((item) => item.providerId)).toEqual(["credential"]);
  });

  it("A04 rejects an expired verification link and a reused reset token", async () => {
    const shortAuth = createAuth({
      db: ctx.db,
      env: { ...ctx.env, verificationExpiresIn: 1, resetExpiresIn: 1 },
      email: ctx.email,
    });
    clearMemoryMailbox();
    await shortAuth.handler(
      jsonRequest("/api/auth/sign-up/email", {
        name: "",
        email: "a04@example.com",
        password,
        callbackURL: "/verify-email",
      }),
    );
    const verifyUrl = linkFromMailbox("verify_email");
    await wait(1100);
    const expired = await shortAuth.handler(new Request(verifyUrl));
    expect(expired.headers.get("location")).toContain("error=");
    expect(cookiesFrom(expired)).not.toContain("session_token=");
    expect((await ctx.db.select().from(user))[0]?.emailVerified).toBe(false);

    clearMemoryMailbox();
    await ctx.auth.handler(
      jsonRequest("/api/auth/send-verification-email", { email: "a04@example.com", callbackURL: "/verify-email" }),
    );
    const freshUrl = linkFromMailbox("verify_email");
    const fresh = await ctx.auth.handler(new Request(freshUrl));
    expect(cookiesFrom(fresh)).toContain("session_token=");
    await ctx.auth.handler(new Request(freshUrl));
    const users = await ctx.db.select().from(user);
    expect(users).toHaveLength(1);
    expect(users[0]?.emailVerified).toBe(true);

    clearMemoryMailbox();
    await ctx.auth.handler(
      jsonRequest("/api/auth/request-password-reset", {
        email: "a04@example.com",
        redirectTo: `${origin}/reset-password`,
      }),
    );
    const resetStart = await ctx.auth.handler(new Request(linkFromMailbox("reset_password")));
    const token = new URL(resetStart.headers.get("location") ?? origin).searchParams.get("token");
    const nextPassword = "Harbor-Light-43";
    expect((await ctx.auth.handler(jsonRequest("/api/auth/reset-password", { newPassword: nextPassword, token }))).status).toBe(200);
    expect((await ctx.auth.handler(jsonRequest("/api/auth/reset-password", { newPassword: "Harbor-Light-44", token }))).status).toBeGreaterThanOrEqual(400);
    expect((await ctx.auth.handler(jsonRequest("/api/auth/sign-in/email", { email: "a04@example.com", password }))).status).toBe(401);
    expect((await ctx.auth.handler(jsonRequest("/api/auth/sign-in/email", { email: "a04@example.com", password: nextPassword }))).status).toBe(200);
  });

  it("A05 restores saved family setup after sign-out", async () => {
    const created = await register(ctx, "a05@example.com");
    await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
    await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-a05",
      body: { patients: [selfPatient("self-a05")] },
    });
    await authRequest(ctx, "/sign-out", { cookie: created.cookie, body: {} });
    expect((await api(ctx, "/api/onboarding", { cookie: created.cookie })).status).toBe(401);
    const returning = await signIn(ctx, "a05@example.com");
    const onboarding = await api(ctx, "/api/onboarding", { cookie: returning.cookie });
    expect(onboarding.data.onboarding.currentStep).toBe("coverage");
    expect(onboarding.data.onboarding.patients).toHaveLength(1);
    expect(onboarding.data.onboarding.patients[0].givenName).toBe("Avery");
    expect(onboarding.data.onboarding.displayName).toBe("Avery Quinn");
  });

  it("A06 lets a caregiver finish without a self patient or invented subscriber", async () => {
    const created = await register(ctx, "a06@example.com");
    await saveProfile(ctx, created.cookie, "Casey Quinn", "someone_else");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-a06",
      body: { patients: [adultPatient("adult-a06", "adult@example.com")] },
    });
    expect(family.data.onboarding.patients).toHaveLength(1);
    expect(family.data.onboarding.patients[0].authorityCategory).not.toBe("self");
    await api(ctx, "/api/onboarding/coverage", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "coverage-a06",
      body: { skip: true },
    });
    await api(ctx, "/api/onboarding/review", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "review-a06",
      body: {},
    });
    const onboarding = await api(ctx, "/api/onboarding", { cookie: created.cookie });
    expect(onboarding.data.onboarding.currentStep).toBe("complete");
    expect(onboarding.data.onboarding.coverage).toHaveLength(0);
    const records = await api(ctx, `/api/patients/${onboarding.data.onboarding.patients[0].id}/records`, { cookie: created.cookie });
    expect(records.status).toBe(403);
    expect(records.data.error.code).toBe("grant_required");
    expect(readMemoryMailbox().some((message) => message.purpose === "invitation")).toBe(false);
  });

  it("A07 keeps another adult pending until that person accepts the requested scope", async () => {
    const caregiver = await register(ctx, "caregiver-a07@example.com");
    const adult = await register(ctx, "adult-a07@example.com");
    await saveProfile(ctx, caregiver.cookie, "Casey Quinn", "someone_else");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: caregiver.cookie,
      idempotencyKey: "family-a07",
      body: { patients: [adultPatient("adult-a07", "adult-a07@example.com", ["profile.read"])] },
    });
    const person = family.data.onboarding.patients[0];
    expect(person.status.code).toBe("invitation_draft");
    expect((await api(ctx, `/api/patients/${person.id}/records`, { cookie: caregiver.cookie })).status).toBe(403);
    const sent = await api(ctx, `/api/invitations/${person.invitation.id}/send`, { method: "POST", cookie: caregiver.cookie });
    expect(sent.data.delivery).toBe("memory");
    const token = tokenFromMailbox();
    expect((await api(ctx, `/api/invitation-links/${token}`, { cookie: adult.cookie })).data.invitation.scopeLabels).toEqual(["View profile"]);
    expect((await api(ctx, `/api/invitation-links/${token}/accept`, { method: "POST", cookie: adult.cookie })).status).toBe(200);
    const caregiverRecords = await api(ctx, `/api/patients/${person.id}/records`, { cookie: caregiver.cookie });
    expect(caregiverRecords.status).toBe(403);
    expect(caregiverRecords.data.error.code).toBe("scope_denied");
    expect((await api(ctx, `/api/patients/${person.id}/records`, { cookie: adult.cookie })).status).toBe(501);
  });

  it("A08 closes invitations on expiry, rejection, and cancellation", async () => {
    const caregiver = await register(ctx, "caregiver-a08@example.com");
    const adult = await register(ctx, "adult-a08@example.com");
    await saveProfile(ctx, caregiver.cookie, "Casey Quinn", "both");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: caregiver.cookie,
      idempotencyKey: "family-a08",
      body: { patients: [selfPatient("self-a08"), adultPatient("adult-a08", "adult-a08@example.com")] },
    });
    const person = family.data.onboarding.patients.find((item: { authorityCategory: string }) => item.authorityCategory === "adult_invitation");
    await api(ctx, `/api/invitations/${person.invitation.id}/send`, { method: "POST", cookie: caregiver.cookie });
    const expiredToken = tokenFromMailbox();
    setNow(new Date(getNow().getTime() + 8 * 24 * 60 * 60 * 1000));
    expect((await api(ctx, `/api/invitation-links/${expiredToken}/accept`, { method: "POST", cookie: adult.cookie })).status).toBe(410);
    expect((await api(ctx, `/api/invitation-links/${expiredToken}/accept`, { method: "POST", cookie: adult.cookie })).status).toBeGreaterThanOrEqual(400);

    clearMemoryMailbox();
    const rejectedFamily = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: caregiver.cookie,
      idempotencyKey: "family-a08-b",
      body: { patients: [selfPatient("self-a08"), adultPatient("adult-a08b", "adult-a08@example.com")] },
    });
    const second = rejectedFamily.data.onboarding.patients.find((item: { clientKey: string }) => item.clientKey === "adult-a08b");
    await api(ctx, `/api/invitations/${second.invitation.id}/send`, { method: "POST", cookie: caregiver.cookie });
    const rejectToken = tokenFromMailbox();
    expect((await api(ctx, `/api/invitation-links/${rejectToken}/reject`, { method: "POST", cookie: adult.cookie })).data.accessGrantCreated).toBe(false);
    expect((await api(ctx, `/api/invitation-links/${rejectToken}/accept`, { method: "POST", cookie: adult.cookie })).status).toBe(409);

    clearMemoryMailbox();
    const canceledFamily = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: caregiver.cookie,
      idempotencyKey: "family-a08-c",
      body: { patients: [selfPatient("self-a08"), adultPatient("adult-a08c", "adult-a08@example.com")] },
    });
    const third = canceledFamily.data.onboarding.patients.find((item: { clientKey: string }) => item.clientKey === "adult-a08c");
    await api(ctx, `/api/invitations/${third.invitation.id}/send`, { method: "POST", cookie: caregiver.cookie });
    const cancelToken = tokenFromMailbox();
    expect((await api(ctx, `/api/invitations/${third.invitation.id}/cancel`, { method: "POST", cookie: caregiver.cookie })).data.status).toBe("canceled");
    expect((await api(ctx, `/api/invitation-links/${cancelToken}/accept`, { method: "POST", cookie: adult.cookie })).status).toBeGreaterThanOrEqual(400);
    expect((await api(ctx, `/api/patients/${person.id}/records`, { cookie: caregiver.cookie })).status).toBe(403);
  });

  it("A09 denies protected work after revocation without ending the session", async () => {
    const owner = await register(ctx, "owner-a09@example.com");
    await saveProfile(ctx, owner.cookie, "Avery Quinn", "self");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: owner.cookie,
      idempotencyKey: "family-a09",
      body: { patients: [selfPatient("self-a09")] },
    });
    const patientId = family.data.onboarding.patients[0].id as string;
    const me = await api(ctx, "/api/me", { cookie: owner.cookie });
    expect((await api(ctx, `/api/patients/${patientId}/records`, { cookie: owner.cookie })).status).toBe(501);
    await api(ctx, `/api/patients/${patientId}/grants/revoke`, {
      method: "POST",
      cookie: owner.cookie,
      body: { userId: me.data.user.id, adminRole: "owner" },
    });
    expect((await api(ctx, `/api/patients/${patientId}/records`, { cookie: owner.cookie })).status).toBe(403);
    expect((await api(ctx, `/api/patients/${patientId}/documents/doc-1`, { cookie: owner.cookie })).status).toBe(403);
    expect((await api(ctx, `/api/patients/${patientId}/records`, { method: "POST", cookie: owner.cookie, body: {} })).status).toBe(403);
    const job = await authorizeQueuedRecordJob(
      ctx.db,
      { id: me.data.user.id, email: me.data.user.email, name: "Avery Quinn", emailVerified: true, role: "member", accessStatus: "approved" },
      patientId,
      getNow(),
    );
    expect(job.queued).toBe(false);
    expect(job.decision.allowed).toBe(false);
    expect((await api(ctx, "/api/me", { cookie: owner.cookie })).status).toBe(200);
    expect((await api(ctx, "/api/household", { cookie: owner.cookie })).status).toBe(200);
  });

  it("A10 ignores client-asserted roles and other account identifiers", async () => {
    const left = await register(ctx, "left-a10@example.com");
    const right = await register(ctx, "right-a10@example.com");
    await saveProfile(ctx, left.cookie, "Left Quinn", "self");
    const leftFamily = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: left.cookie,
      idempotencyKey: "family-left",
      body: { patients: [selfPatient("self-left")] },
    });
    await saveProfile(ctx, right.cookie, "Right Quinn", "self", { adminRole: "owner", userId: "someone-else" });
    const rightFamily = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: right.cookie,
      idempotencyKey: "family-right",
      body: { patients: [selfPatient("self-right")], householdRole: "owner", userId: "left-user" },
    });
    const leftPatient = leftFamily.data.onboarding.patients[0].id as string;
    const leftHousehold = leftFamily.data.onboarding.householdId as string;
    expect((await api(ctx, `/api/patients/${leftPatient}`, { cookie: right.cookie })).status).toBe(404);
    expect((await api(ctx, `/api/households/${leftHousehold}`, { cookie: right.cookie })).status).toBe(404);
    const crossedWrite = await api(ctx, `/api/patients/${leftPatient}/records`, {
      method: "POST",
      cookie: right.cookie,
      body: { role: "owner" },
    });
    expect(crossedWrite.status).toBe(404);
    expect(JSON.stringify(crossedWrite.data).toLowerCase()).not.toContain("avery");
    const rightHousehold = await api(ctx, "/api/household", { cookie: right.cookie });
    expect(rightHousehold.data.households).toHaveLength(1);
    expect(rightHousehold.data.households[0].members).toHaveLength(1);
    expect(rightHousehold.data.households[0].yourAdminRole).toBe("owner");
    expect(rightFamily.data.onboarding.patients).toHaveLength(1);
  });

  it("A11 keeps a repeated save to one profile and one coverage record", async () => {
    const created = await register(ctx, "a11@example.com");
    await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
    const body = { patients: [selfPatient("self-a11")] };
    const first = await api(ctx, "/api/onboarding/family", { method: "POST", cookie: created.cookie, idempotencyKey: "family-a11", body });
    const second = await api(ctx, "/api/onboarding/family", { method: "POST", cookie: created.cookie, idempotencyKey: "family-a11", body });
    expect(second.data.onboarding.patients).toHaveLength(1);
    expect(second.data.onboarding.patients[0].id).toBe(first.data.onboarding.patients[0].id);
    const patientId = first.data.onboarding.patients[0].id as string;
    const coverageBody = {
      records: [
        {
          clientKey: "coverage-a11",
          insurer: "Northwind Health",
          planName: "Outpatient",
          subscriberName: null,
          subscriberPatientId: patientId,
          memberId: "MEM-123456",
          groupNumber: "G-9",
          start: { state: "known", value: "2024-01-01" },
          end: { state: "unknown" },
          coveredPatientIds: [patientId],
        },
      ],
    };
    await api(ctx, "/api/onboarding/coverage", { method: "POST", cookie: created.cookie, idempotencyKey: "coverage-a11", body: coverageBody });
    const repeat = await api(ctx, "/api/onboarding/coverage", { method: "POST", cookie: created.cookie, idempotencyKey: "coverage-a11", body: coverageBody });
    expect(repeat.data.onboarding.coverage).toHaveLength(1);
    expect(repeat.data.onboarding.coverage[0].memberIdMasked).toBe("••56");
    expect(repeat.data.onboarding.coverage[0].end).toEqual({ state: "unknown" });
  });

  it("A12 rejects impossible dates and stores unknown coverage dates as unknown", async () => {
    const created = await register(ctx, "a12@example.com");
    await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
    const invalidBirth = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-bad-date",
      body: { patients: [{ ...selfPatient("self-a12"), birthDate: "2026-02-31" }] },
    });
    expect(invalidBirth.status).toBe(422);
    expect(invalidBirth.data.error.fields["patients.0.birthDate"]).toContain("real calendar date");
    const saved = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-a12",
      body: { patients: [selfPatient("self-a12")] },
    });
    const badCoverage = await api(ctx, "/api/onboarding/coverage", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "coverage-bad",
      body: {
        records: [
          {
            clientKey: "coverage-a12",
            insurer: "Northwind",
            planName: null,
            subscriberName: null,
            subscriberPatientId: null,
            memberId: null,
            groupNumber: null,
            start: { state: "known", value: "2024-05-01" },
            end: { state: "known", value: "2024-04-01" },
            coveredPatientIds: [saved.data.onboarding.patients[0].id],
          },
        ],
      },
    });
    expect(badCoverage.status).toBe(422);
    const unknown = await api(ctx, "/api/onboarding/coverage", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "coverage-unknown",
      body: {
        records: [
          {
            clientKey: "coverage-unknown",
            insurer: null,
            planName: null,
            subscriberName: null,
            subscriberPatientId: null,
            memberId: null,
            groupNumber: null,
            start: { state: "unknown" },
            end: { state: "unknown" },
            coveredPatientIds: [],
          },
        ],
      },
    });
    expect(unknown.data.onboarding.coverage[0].start).toEqual({ state: "unknown" });
    expect(unknown.data.onboarding.coverage[0].subscriberName).toBeNull();
  });

  it("A13 leaves representative authority pending and blocks protected records", async () => {
    const created = await register(ctx, "a13@example.com");
    await saveProfile(ctx, created.cookie, "Casey Quinn", "someone_else");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-a13",
      body: {
        patients: [
          {
            clientKey: "minor-a13",
            givenName: "Robin",
            familyName: "Quinn",
            preferredName: null,
            birthDate: "2016-04-02",
            relationship: "child",
            authorityCategory: "minor_representative",
          },
        ],
      },
    });
    const person = family.data.onboarding.patients[0];
    expect(person.status.code).toBe("authority_pending");
    expect(person.status.detail).toContain("does not decide guardianship");
    expect(person.authorityReview.status).toBe("pending_review");
    expect((await api(ctx, `/api/patients/${person.id}/records`, { cookie: created.cookie })).status).toBe(403);
    const policy = await loadJurisdictionPolicy(ctx.db);
    expect(assessAgeTransition("2016-04-02", policy, getNow()).outcome).toBe("policy_not_configured");
    expect(assessAgeTransition("1980-04-02", policy, getNow()).outcome).toBe("policy_not_configured");
  });

  it("A14 reports a database outage without a false success", async () => {
    const opened = await applyMigrations("pglite:memory", path.join(process.cwd(), "drizzle"));
    const email = createEmailSender({ mode: "memory", db: opened.db, resendApiKey: null, emailFrom: null, now: () => new Date() });
    const auth = createAuth({ db: opened.db, env: ctx.env, email });
    await opened.close();
    const response = await auth.handler(
      jsonRequest("/api/auth/sign-up/email", { name: "", email: "outage@example.com", password }),
    );
    const body = await response.json().catch(() => ({ ok: false }));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).not.toBe(200);
    expect(JSON.stringify(body)).not.toContain(password);
    expect(reduceForm({ email: "outage@example.com", password }, { type: "error" })).toEqual({
      email: "outage@example.com",
      password,
    });
  });

  it("keeps household membership separate from patient access", async () => {
    const owner = await register(ctx, "owner-admin@example.com");
    const helper = await register(ctx, "helper-admin@example.com");
    await saveProfile(ctx, owner.cookie, "Avery Quinn", "self");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: owner.cookie,
      idempotencyKey: "family-admin",
      body: { patients: [selfPatient("self-admin")] },
    });
    const added = await api(ctx, "/api/household/members", {
      method: "POST",
      cookie: owner.cookie,
      idempotencyKey: "member-admin",
      body: { email: "helper-admin@example.com", adminRole: "member" },
    });
    expect(added.data.accessGrantCreated).toBe(false);
    const patientId = family.data.onboarding.patients[0].id as string;
    expect((await api(ctx, `/api/patients/${patientId}/records`, { cookie: helper.cookie })).status).toBe(403);
    const removed = await api(ctx, "/api/household/members/remove", {
      method: "POST",
      cookie: owner.cookie,
      body: { userId: added.data.userId },
    });
    expect(removed.data.grantsChanged).toBe(false);
    expect(removed.data.patientsDeleted).toBe(false);
    expect((await api(ctx, `/api/patients/${patientId}/records`, { cookie: owner.cookie })).status).toBe(501);
  });
});

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
