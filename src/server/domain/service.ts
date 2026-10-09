import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/client";
import {
  accessGrant,
  account,
  accountPreference,
  actionRate,
  auditEvent,
  authorityReview,
  coverage,
  coveragePatient,
  coverageVersion,
  household,
  householdMembership,
  idempotencyKey,
  invitation,
  onboardingState,
  patient,
  privacyRequest,
  user,
} from "../db/schema";
import { createToken, hashToken, listDevOutbox, type EmailSender } from "../email/delivery";
import type { AppEnv } from "../env";
import { HttpError } from "../http/errors";
import type { Auth } from "../auth/create-auth";
import {
  assessAgeTransition,
  authorizeQueuedRecordJob,
  decidePatientAccess,
  loadJurisdictionPolicy,
  type Actor,
} from "./access";
import {
  DEFAULT_SHARED_SCOPES,
  SELF_SCOPES,
  assertRealDate,
  coverageSaveSchema,
  familyInputSchema,
  isUuid,
  memberAddSchema,
  memberRemoveSchema,
  parseInput,
  preferenceSchema,
  privacyRequestSchema,
  profileInputSchema,
  revokeSchema,
  type Scope,
} from "./validation";

export type AppContext = {
  db: AppDatabase;
  auth: Auth;
  email: EmailSender;
  env: AppEnv;
  now: () => Date;
};

type CommandResult = { status: number; body: Record<string, unknown> };
type OrganizingFor = "self" | "someone_else" | "both";
type Step = "profile" | "family" | "coverage" | "review" | "complete";

export function homeFor(step: Step, emailVerified: boolean): string {
  if (!emailVerified) return "/verify-email";
  if (step === "complete") return "/app";
  return `/onboarding/${step}`;
}

export async function getMe(ctx: AppContext, actor: Actor) {
  const view = await getOnboarding(ctx, actor);
  return {
    ok: true,
    user: {
      id: actor.id,
      email: actor.email,
      emailVerified: actor.emailVerified,
      displayName: blankName(actor.name),
    },
    home: homeFor(view.onboarding.currentStep, actor.emailVerified),
  };
}

export async function getOnboarding(ctx: AppContext, actor: Actor) {
  requireVerified(actor);
  await expireSentInvitations(ctx, actor.id);
  const body = await buildOnboardingBody(ctx, actor);
  return body;
}

export async function saveProfile(ctx: AppContext, actor: Actor, raw: unknown, idempotencyKeyValue: string) {
  requireVerified(actor);
  const input = parseInput(profileInputSchema, raw);
  return withIdempotency(ctx, actor.id, "onboarding.profile", idempotencyKeyValue, raw, async (tx) => {
    const now = ctx.now();
    let state = await findState(tx, actor.id);
    let householdId = state?.householdId ?? null;
    if (!householdId) {
      householdId = randomUUID();
      await tx.insert(household).values({
        id: householdId,
        displayName: `${input.displayName}'s household`,
        origin: "user",
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(householdMembership).values({
        id: randomUUID(),
        householdId,
        userId: actor.id,
        adminRole: "owner",
        createdAt: now,
      });
      await writeAudit(tx, now, {
        actorUserId: actor.id,
        householdId,
        eventName: "household_created",
        entityType: "household",
        entityId: householdId,
      });
    } else if (state?.organizingFor && state.organizingFor !== input.organizingFor) {
      const existing = await tx.select({ id: patient.id }).from(patient).where(eq(patient.householdId, householdId));
      if (existing.length > 0) {
        throw new HttpError(
          409,
          "organizing_locked",
          "Remove the people you added before changing who this account is for.",
        );
      }
    }
    await tx.update(user).set({ name: input.displayName, updatedAt: now }).where(eq(user.id, actor.id));
    if (!state) {
      await tx.insert(onboardingState).values({
        userId: actor.id,
        householdId,
        organizingFor: input.organizingFor,
        profileCompletedAt: now,
        version: 1,
        updatedAt: now,
      });
    } else {
      await tx
        .update(onboardingState)
        .set({
          householdId,
          organizingFor: input.organizingFor,
          profileCompletedAt: state.profileCompletedAt ?? now,
          version: state.version + 1,
          updatedAt: now,
        })
        .where(eq(onboardingState.userId, actor.id));
    }
    await tx
      .update(household)
      .set({ displayName: `${input.displayName}'s household`, updatedAt: now })
      .where(eq(household.id, householdId));
    await writeAudit(tx, now, {
      actorUserId: actor.id,
      householdId,
      eventName: "profile_saved",
      entityType: "user",
      entityId: actor.id,
    });
    return { status: 200, body: await buildOnboardingBody(ctx, { ...actor, name: input.displayName }, tx) };
  });
}

export async function saveFamily(ctx: AppContext, actor: Actor, raw: unknown, idempotencyKeyValue: string) {
  requireVerified(actor);
  const input = parseInput(familyInputSchema, raw);
  return withIdempotency(ctx, actor.id, "onboarding.family", idempotencyKeyValue, raw, async (tx) => {
    const state = await requireHouseholdState(tx, actor.id);
    const organizingFor = state.organizingFor as OrganizingFor;
    const now = ctx.now();
    const keys = new Set<string>();
    for (const [index, person] of input.patients.entries()) {
      if (keys.has(person.clientKey)) {
        throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
          [`patients.${index}.clientKey`]: "Each person needs their own save key.",
        });
      }
      keys.add(person.clientKey);
      validatePerson(person, index, organizingFor, now);
      await upsertPerson(tx, ctx, actor, state.householdId!, person, now);
    }
    const people = await tx.select().from(patient).where(eq(patient.householdId, state.householdId!));
    assertFamilyComplete(organizingFor, people);
    await tx
      .update(onboardingState)
      .set({ familyCompletedAt: state.familyCompletedAt ?? now, version: state.version + 1, updatedAt: now })
      .where(eq(onboardingState.userId, actor.id));
    await writeAudit(tx, now, {
      actorUserId: actor.id,
      householdId: state.householdId,
      eventName: "family_saved",
      entityType: "household",
      entityId: state.householdId!,
    });
    return { status: 200, body: await buildOnboardingBody(ctx, actor, tx) };
  });
}

export async function saveCoverageStep(ctx: AppContext, actor: Actor, raw: unknown, idempotencyKeyValue: string) {
  requireVerified(actor);
  const input = parseInput(coverageSaveSchema, raw);
  const records = input.records ?? [];
  if (input.skip && records.length > 0) {
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
      form: "Skip coverage or save records, not both.",
    });
  }
  return withIdempotency(ctx, actor.id, "onboarding.coverage", idempotencyKeyValue, raw, async (tx) => {
    const state = await requireHouseholdState(tx, actor.id);
    if (!state.familyCompletedAt) {
      throw new HttpError(409, "step_incomplete", "Save the family step before coverage.");
    }
    const now = ctx.now();
    for (const [index, record] of records.entries()) {
      await upsertCoverage(tx, ctx, actor, state.householdId!, record, index, now);
    }
    await tx
      .update(onboardingState)
      .set({ coverageCompletedAt: state.coverageCompletedAt ?? now, version: state.version + 1, updatedAt: now })
      .where(eq(onboardingState.userId, actor.id));
    await writeAudit(tx, now, {
      actorUserId: actor.id,
      householdId: state.householdId,
      eventName: input.skip ? "coverage_skipped" : "coverage_saved",
      entityType: "household",
      entityId: state.householdId!,
    });
    return { status: 200, body: await buildOnboardingBody(ctx, actor, tx) };
  });
}

export async function completeReview(ctx: AppContext, actor: Actor, raw: unknown, idempotencyKeyValue: string) {
  requireVerified(actor);
  return withIdempotency(ctx, actor.id, "onboarding.review", idempotencyKeyValue, raw ?? {}, async (tx) => {
    const state = await requireHouseholdState(tx, actor.id);
    if (!state.familyCompletedAt || !state.coverageCompletedAt) {
      throw new HttpError(409, "step_incomplete", "Finish family and coverage before confirming.");
    }
    const now = ctx.now();
    await tx
      .update(onboardingState)
      .set({ reviewCompletedAt: state.reviewCompletedAt ?? now, version: state.version + 1, updatedAt: now })
      .where(eq(onboardingState.userId, actor.id));
    await writeAudit(tx, now, {
      actorUserId: actor.id,
      householdId: state.householdId,
      eventName: "onboarding_confirmed",
      entityType: "household",
      entityId: state.householdId!,
    });
    return { status: 200, body: await buildOnboardingBody(ctx, actor, tx) };
  });
}

export async function getHousehold(ctx: AppContext, actor: Actor) {
  requireVerified(actor);
  await expireSentInvitations(ctx, actor.id);
  const memberships = await ctx.db
    .select()
    .from(householdMembership)
    .where(eq(householdMembership.userId, actor.id));
  const households = [];
  for (const membership of memberships) {
    households.push(await householdAdminView(ctx.db, actor, membership.householdId, membership.adminRole));
  }
  const grants = await listGrantedPatients(ctx, actor);
  return { ok: true, households, grantedPatients: grants };
}

export async function getHouseholdById(ctx: AppContext, actor: Actor, householdId: string) {
  requireVerified(actor);
  if (!isUuid(householdId)) throw new HttpError(404, "not_found", "That household was not found.");
  const membership = await findMembership(ctx.db, actor.id, householdId);
  if (!membership) throw new HttpError(404, "not_found", "That household was not found.");
  return { ok: true, household: await householdAdminView(ctx.db, actor, householdId, membership.adminRole) };
}

export async function addHouseholdMember(ctx: AppContext, actor: Actor, raw: unknown, idempotencyKeyValue: string) {
  requireVerified(actor);
  const input = parseInput(memberAddSchema, raw);
  return withIdempotency(ctx, actor.id, "household.member.add", idempotencyKeyValue, raw, async (tx) => {
    const state = await requireHouseholdState(tx, actor.id);
    await requireAdmin(tx, actor.id, state.householdId!, ["owner"]);
    await assertRate(tx, actor.id, "household.member.add", 10, 60 * 60 * 1000, ctx.now());
    const [found] = await tx
      .select()
      .from(user)
      .where(eq(user.email, input.email.toLowerCase()))
      .limit(1);
    if (!found?.emailVerified) {
      throw new HttpError(404, "account_not_found", "No verified account was found for that email.");
    }
    const [existing] = await tx
      .select()
      .from(householdMembership)
      .where(and(eq(householdMembership.householdId, state.householdId!), eq(householdMembership.userId, found.id)))
      .limit(1);
    if (!existing) {
      await tx.insert(householdMembership).values({
        id: randomUUID(),
        householdId: state.householdId!,
        userId: found.id,
        adminRole: input.adminRole,
        createdAt: ctx.now(),
      });
    }
    await writeAudit(tx, ctx.now(), {
      actorUserId: actor.id,
      householdId: state.householdId,
      eventName: "household_member_added",
      entityType: "user",
      entityId: found.id,
    });
    return {
      status: 200,
      body: { ok: true, userId: found.id, adminRole: existing?.adminRole ?? input.adminRole, accessGrantCreated: false },
    };
  });
}

export async function removeHouseholdMember(ctx: AppContext, actor: Actor, raw: unknown) {
  requireVerified(actor);
  const input = parseInput(memberRemoveSchema, raw);
  const state = await requireHouseholdState(ctx.db, actor.id);
  await requireAdmin(ctx.db, actor.id, state.householdId!, ["owner"]);
  if (input.userId === actor.id) {
    throw new HttpError(409, "owner_required", "The household owner cannot be removed this way.");
  }
  const [membership] = await ctx.db
    .select()
    .from(householdMembership)
    .where(and(eq(householdMembership.householdId, state.householdId!), eq(householdMembership.userId, input.userId)))
    .limit(1);
  if (!membership) throw new HttpError(404, "not_found", "That household member was not found.");
  if (membership.adminRole === "owner") {
    throw new HttpError(409, "owner_required", "The household owner cannot be removed this way.");
  }
  await ctx.db.delete(householdMembership).where(eq(householdMembership.id, membership.id));
  await writeAudit(ctx.db, ctx.now(), {
    actorUserId: actor.id,
    householdId: state.householdId,
    eventName: "household_member_removed",
    entityType: "user",
    entityId: input.userId,
  });
  return { ok: true, removedMembership: true, grantsChanged: false, patientsDeleted: false };
}

export async function getPatient(ctx: AppContext, actor: Actor, patientId: string) {
  requireVerified(actor);
  if (!isUuid(patientId)) throw new HttpError(404, "not_found", "That record was not found.");
  const [found] = await ctx.db.select().from(patient).where(eq(patient.id, patientId)).limit(1);
  if (!found) throw new HttpError(404, "not_found", "That record was not found.");
  const membership = await findMembership(ctx.db, actor.id, found.householdId);
  const decision = await decidePatientAccess(ctx.db, actor, patientId, "profile.read", ctx.now());
  if (!membership && !decision.allowed) {
    throw new HttpError(decision.status, decision.code, decision.message);
  }
  const people = await loadPatientViews(ctx.db, actor, found.householdId, ctx.now());
  const view = people.find((item) => item.id === patientId);
  if (!view) throw new HttpError(404, "not_found", "That record was not found.");
  const visible = membership
    ? view
    : {
        ...view,
        invitation: null,
        grants: view.grants.filter((item) => item.userId === actor.id),
      };
  return {
    ok: true,
    patient: visible,
    householdRole: membership?.adminRole ?? null,
    protectedRecords: decision.allowed
      ? "not_in_this_release"
      : decision.code,
  };
}

export async function readProtectedRecords(ctx: AppContext, actor: Actor, patientId: string) {
  const decision = await decidePatientAccess(ctx.db, actor, patientId, "records.read", ctx.now());
  if (!decision.allowed) throw new HttpError(decision.status, decision.code, decision.message);
  throw new HttpError(
    501,
    "not_in_this_release",
    "Medical records, bills, and explanations of benefits are not available in this version.",
  );
}

export async function mutateProtectedRecords(ctx: AppContext, actor: Actor, patientId: string) {
  const decision = await decidePatientAccess(ctx.db, actor, patientId, "records.write", ctx.now());
  if (!decision.allowed) throw new HttpError(decision.status, decision.code, decision.message);
  throw new HttpError(
    501,
    "not_in_this_release",
    "Medical records, bills, and explanations of benefits are not available in this version.",
  );
}

export async function revokeGrant(ctx: AppContext, actor: Actor, patientId: string, raw: unknown) {
  requireVerified(actor);
  const input = parseInput(revokeSchema, raw);
  if (!isUuid(patientId)) throw new HttpError(404, "not_found", "That record was not found.");
  const [found] = await ctx.db.select().from(patient).where(eq(patient.id, patientId)).limit(1);
  if (!found) throw new HttpError(404, "not_found", "That record was not found.");
  const membership = await findMembership(ctx.db, actor.id, found.householdId);
  const actorIsAdmin = membership && (membership.adminRole === "owner" || membership.adminRole === "admin");
  if (!actorIsAdmin && actor.id !== input.userId) {
    throw new HttpError(404, "not_found", "That record was not found.");
  }
  const [grant] = await ctx.db
    .select()
    .from(accessGrant)
    .where(and(eq(accessGrant.patientId, patientId), eq(accessGrant.userId, input.userId)))
    .limit(1);
  if (!grant) throw new HttpError(404, "not_found", "That access grant was not found.");
  if (grant.status !== "revoked") {
    await ctx.db
      .update(accessGrant)
      .set({ status: "revoked", revokedAt: ctx.now(), updatedAt: ctx.now(), version: grant.version + 1 })
      .where(eq(accessGrant.id, grant.id));
    await writeAudit(ctx.db, ctx.now(), {
      actorUserId: actor.id,
      householdId: found.householdId,
      eventName: "access_revoked",
      entityType: "access_grant",
      entityId: grant.id,
    });
  }
  return { ok: true, status: "revoked" };
}

export async function removePendingPatient(ctx: AppContext, actor: Actor, patientId: string) {
  requireVerified(actor);
  if (!isUuid(patientId)) throw new HttpError(404, "not_found", "That record was not found.");
  const [found] = await ctx.db.select().from(patient).where(eq(patient.id, patientId)).limit(1);
  if (!found) throw new HttpError(404, "not_found", "That record was not found.");
  await requireAdmin(ctx.db, actor.id, found.householdId, ["owner", "admin"]);
  const grants = await ctx.db.select({ id: accessGrant.id }).from(accessGrant).where(eq(accessGrant.patientId, patientId));
  if (grants.length > 0) {
    throw new HttpError(409, "grant_exists", "This profile has access history. Revoke access or request deletion instead of removing it.");
  }
  await ctx.db.delete(patient).where(eq(patient.id, patientId));
  const state = await findState(ctx.db, actor.id);
  if (state?.householdId === found.householdId) {
    const remaining = await ctx.db.select().from(patient).where(eq(patient.householdId, found.householdId));
    const organizingFor = state.organizingFor as OrganizingFor | null;
    const stillValid = organizingFor ? familyIsValid(organizingFor, remaining) : false;
    if (!stillValid) {
      await ctx.db
        .update(onboardingState)
        .set({ familyCompletedAt: null, reviewCompletedAt: null, updatedAt: ctx.now(), version: state.version + 1 })
        .where(eq(onboardingState.userId, actor.id));
    }
  }
  await writeAudit(ctx.db, ctx.now(), {
    actorUserId: actor.id,
    householdId: found.householdId,
    eventName: "pending_patient_removed",
    entityType: "patient",
    entityId: patientId,
  });
  return { ok: true };
}

export async function sendInvitation(ctx: AppContext, actor: Actor, invitationId: string) {
  requireVerified(actor);
  if (!isUuid(invitationId)) throw new HttpError(404, "not_found", "That invitation was not found.");
  const [row] = await ctx.db.select().from(invitation).where(eq(invitation.id, invitationId)).limit(1);
  if (!row) throw new HttpError(404, "not_found", "That invitation was not found.");
  await requireAdmin(ctx.db, actor.id, row.householdId, ["owner", "admin"]);
  if (row.status === "sent") {
    return { ok: true, status: "sent", delivery: "already_sent" };
  }
  if (row.status !== "draft" && row.status !== "send_failed") {
    throw new HttpError(409, "invitation_closed", "This invitation can no longer be sent.");
  }
  await assertRate(ctx.db, actor.id, "invitation.send", 10, 60 * 60 * 1000, ctx.now());
  const token = createToken();
  const expiresAt = new Date(ctx.now().getTime() + ctx.env.invitationExpiresInMs);
  const updated = await ctx.db
    .update(invitation)
    .set({
      status: "sending",
      tokenHash: hashToken(token),
      expiresAt,
      updatedAt: ctx.now(),
      version: row.version + 1,
    })
    .where(and(eq(invitation.id, row.id), inArray(invitation.status, ["draft", "send_failed"])))
    .returning();
  if (updated.length === 0) {
    const [current] = await ctx.db.select().from(invitation).where(eq(invitation.id, row.id)).limit(1);
    if (current?.status === "sent") return { ok: true, status: "sent", delivery: "already_sent" };
    throw new HttpError(409, "invitation_closed", "This invitation can no longer be sent.");
  }
  const result = await ctx.email.send({
    to: row.invitedEmail,
    purpose: "invitation",
    subject: "Review access to a CareUnfold profile",
    text: `Someone asked you to review access to a care profile in CareUnfold. The link expires and can be used once.\n\n${ctx.env.authUrl}/invitations/${token}\n\nIf you do not expect this, ignore the message. No records are shared until you accept.`,
  });
  if (!result.delivered) {
    await ctx.db
      .update(invitation)
      .set({ status: "send_failed", tokenHash: null, expiresAt: null, updatedAt: ctx.now() })
      .where(eq(invitation.id, row.id));
    throw new HttpError(
      503,
      "email_not_sent",
      result.mode === "unconfigured"
        ? "The invitation was not sent because email delivery is not configured."
        : "The invitation was not sent. You can try again.",
    );
  }
  await ctx.db
    .update(invitation)
    .set({ status: "sent", sentAt: ctx.now(), updatedAt: ctx.now() })
    .where(eq(invitation.id, row.id));
  await writeAudit(ctx.db, ctx.now(), {
    actorUserId: actor.id,
    householdId: row.householdId,
    eventName: "invitation_sent",
    entityType: "invitation",
    entityId: row.id,
  });
  return { ok: true, status: "sent", delivery: result.mode };
}

export async function cancelInvitation(ctx: AppContext, actor: Actor, invitationId: string) {
  requireVerified(actor);
  if (!isUuid(invitationId)) throw new HttpError(404, "not_found", "That invitation was not found.");
  const [row] = await ctx.db.select().from(invitation).where(eq(invitation.id, invitationId)).limit(1);
  if (!row) throw new HttpError(404, "not_found", "That invitation was not found.");
  await requireAdmin(ctx.db, actor.id, row.householdId, ["owner", "admin"]);
  if (row.status === "accepted" || row.status === "rejected" || row.status === "canceled" || row.status === "expired") {
    throw new HttpError(409, "invitation_closed", "This invitation is already closed.");
  }
  await ctx.db
    .update(invitation)
    .set({ status: "canceled", tokenHash: null, resolvedAt: ctx.now(), updatedAt: ctx.now(), version: row.version + 1 })
    .where(eq(invitation.id, row.id));
  await writeAudit(ctx.db, ctx.now(), {
    actorUserId: actor.id,
    householdId: row.householdId,
    eventName: "invitation_canceled",
    entityType: "invitation",
    entityId: row.id,
  });
  return { ok: true, status: "canceled" };
}

export async function previewInvitation(ctx: AppContext, actor: Actor | null, token: string) {
  const row = await findInvitationByToken(ctx, token);
  if (!row || row.status === "draft" || row.status === "sending" || row.status === "send_failed") {
    throw new HttpError(404, "invitation_unavailable", "This invitation is not available.");
  }
  if (row.status === "sent" && row.expiresAt && row.expiresAt <= ctx.now()) {
    await ctx.db
      .update(invitation)
      .set({ status: "expired", resolvedAt: ctx.now(), updatedAt: ctx.now(), version: row.version + 1 })
      .where(eq(invitation.id, row.id));
    throw new HttpError(410, "invitation_expired", "This invitation has expired. Ask for a new one.");
  }
  if (row.status !== "sent") {
    throw new HttpError(409, "invitation_closed", "This invitation is no longer available and cannot be used again.");
  }
  const [person] = await ctx.db.select().from(patient).where(eq(patient.id, row.patientId)).limit(1);
  const [requester] = await ctx.db.select().from(user).where(eq(user.id, row.createdByUserId)).limit(1);
  return {
    ok: true,
    invitation: {
      status: "sent",
      requesterName: blankName(requester?.name ?? "") ?? "A CareUnfold member",
      patientGivenName: person?.givenName ?? "This person",
      scopes: row.requestedScopes,
      scopeLabels: row.requestedScopes.map(scopeLabel),
      emailMatches: actor ? actor.email.toLowerCase() === row.invitedEmail : false,
      signedIn: Boolean(actor),
      emailVerified: actor?.emailVerified ?? false,
    },
  };
}

export async function acceptInvitation(ctx: AppContext, actor: Actor, token: string) {
  requireVerified(actor);
  const row = await requireOpenInvitation(ctx, token, actor);
  const now = ctx.now();
  await ctx.db.transaction(async (tx) => {
    const database = tx as unknown as AppDatabase;
    const [current] = await database.select().from(invitation).where(eq(invitation.id, row.id)).limit(1);
    if (!current || current.status !== "sent") {
      throw new HttpError(409, "invitation_closed", "This invitation is no longer available and cannot be used again.");
    }
    const accepted = await database
      .update(invitation)
      .set({
        status: "accepted",
        acceptedByUserId: actor.id,
        resolvedAt: now,
        updatedAt: now,
        version: current.version + 1,
      })
      .where(and(eq(invitation.id, current.id), eq(invitation.status, "sent")))
      .returning();
    if (accepted.length === 0) {
      throw new HttpError(409, "invitation_closed", "This invitation is no longer available and cannot be used again.");
    }
    await upsertGrant(database, {
      patientId: current.patientId,
      userId: current.createdByUserId,
      scopes: current.requestedScopes as Scope[],
      authorityBasis: "invitation_accepted",
      now,
    });
    await upsertGrant(database, {
      patientId: current.patientId,
      userId: actor.id,
      scopes: SELF_SCOPES,
      authorityBasis: "self",
      now,
      onlyIfMissing: true,
    });
    await database
      .update(patient)
      .set({ profileState: "active", linkedUserId: actor.id, updatedAt: now, version: sql`${patient.version} + 1` })
      .where(eq(patient.id, current.patientId));
    await writeAudit(database, now, {
      actorUserId: actor.id,
      householdId: current.householdId,
      eventName: "invitation_accepted",
      entityType: "invitation",
      entityId: current.id,
    });
  });
  return { ok: true, status: "accepted" };
}

export async function rejectInvitation(ctx: AppContext, actor: Actor, token: string) {
  requireVerified(actor);
  const row = await requireOpenInvitation(ctx, token, actor);
  const rejected = await ctx.db
    .update(invitation)
    .set({ status: "rejected", resolvedAt: ctx.now(), updatedAt: ctx.now(), version: row.version + 1 })
    .where(and(eq(invitation.id, row.id), eq(invitation.status, "sent")))
    .returning();
  if (rejected.length === 0) {
    throw new HttpError(409, "invitation_closed", "This invitation is no longer available and cannot be used again.");
  }
  await writeAudit(ctx.db, ctx.now(), {
    actorUserId: actor.id,
    householdId: row.householdId,
    eventName: "invitation_rejected",
    entityType: "invitation",
    entityId: row.id,
  });
  return { ok: true, status: "rejected", accessGrantCreated: false };
}

export async function getSettings(ctx: AppContext, actor: Actor, request: Request) {
  requireVerified(actor);
  const sessions = await ctx.auth.api.listSessions({ headers: request.headers });
  const current = await ctx.auth.api.getSession({ headers: request.headers });
  const providers = await ctx.db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, actor.id));
  const [preferences] = await ctx.db
    .select()
    .from(accountPreference)
    .where(eq(accountPreference.userId, actor.id))
    .limit(1);
  const requests = await ctx.db
    .select()
    .from(privacyRequest)
    .where(eq(privacyRequest.userId, actor.id))
    .orderBy(desc(privacyRequest.createdAt));
  return {
    ok: true,
    sessions: (Array.isArray(sessions) ? sessions : []).map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      userAgent: item.userAgent,
      ipAddress: item.ipAddress,
      current: item.id === current?.session.id,
    })),
    providers: providers.map((item) => item.providerId),
    googleLinkAvailable: ctx.env.googleEnabled,
    preferences: {
      timeZone: preferences?.timeZone ?? "UTC",
      locale: preferences?.locale ?? "en",
    },
    privacyRequests: requests.map((item) => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      createdAt: item.createdAt,
      detail:
        item.kind === "deletion"
          ? "Deletion is requested and not complete. Access can be revoked now. Retention rules are not approved yet, so this request stays open."
          : "Export is requested and not complete. No file has been generated.",
    })),
  };
}

export async function revokeSessionById(ctx: AppContext, actor: Actor, request: Request, sessionId: string) {
  requireVerified(actor);
  const sessions = await ctx.auth.api.listSessions({ headers: request.headers });
  const match = (Array.isArray(sessions) ? sessions : []).find((item) => item.id === sessionId);
  if (!match) throw new HttpError(404, "not_found", "That session was not found.");
  await ctx.auth.api.revokeSession({ headers: request.headers, body: { token: match.token } });
  await writeAudit(ctx.db, ctx.now(), {
    actorUserId: actor.id,
    householdId: null,
    eventName: "session_revoked",
    entityType: "session",
    entityId: sessionId,
  });
  return { ok: true };
}

export async function revokeOtherSessions(ctx: AppContext, actor: Actor, request: Request) {
  requireVerified(actor);
  await ctx.auth.api.revokeOtherSessions({ headers: request.headers });
  return { ok: true };
}

export async function updatePreferences(ctx: AppContext, actor: Actor, raw: unknown) {
  requireVerified(actor);
  const input = parseInput(preferenceSchema, raw);
  const now = ctx.now();
  await ctx.db
    .insert(accountPreference)
    .values({ userId: actor.id, timeZone: input.timeZone, locale: input.locale, updatedAt: now })
    .onConflictDoUpdate({
      target: accountPreference.userId,
      set: { timeZone: input.timeZone, locale: input.locale, updatedAt: now },
    });
  return { ok: true, preferences: input };
}

export async function createPrivacyRequest(ctx: AppContext, actor: Actor, raw: unknown) {
  requireVerified(actor);
  const input = parseInput(privacyRequestSchema, raw);
  const id = randomUUID();
  await ctx.db.insert(privacyRequest).values({
    id,
    userId: actor.id,
    kind: input.kind,
    status: "requested",
    createdAt: ctx.now(),
  });
  await writeAudit(ctx.db, ctx.now(), {
    actorUserId: actor.id,
    householdId: null,
    eventName: input.kind === "deletion" ? "deletion_requested" : "export_requested",
    entityType: "privacy_request",
    entityId: id,
  });
  return {
    ok: true,
    request: {
      id,
      kind: input.kind,
      status: "requested",
      detail:
        input.kind === "deletion"
          ? "Your deletion request is recorded. It is not complete, and no data has been erased by this action."
          : "Your export request is recorded. No export file has been created.",
    },
  };
}

export async function getDevOutbox(ctx: AppContext) {
  if (ctx.env.emailDelivery !== "dev-sink") {
    throw new HttpError(404, "not_found", "That page was not found.");
  }
  const messages = await listDevOutbox(ctx.db);
  return {
    ok: true,
    delivery: "dev-sink",
    notice: "These messages were stored locally and were not delivered to an inbox.",
    messages: messages.map((message) => ({
      id: message.id,
      recipient: message.recipient,
      subject: message.subject,
      body: message.body,
      purpose: message.purpose,
      createdAt: message.createdAt,
    })),
  };
}

export async function getPublicConfig(ctx: AppContext) {
  return {
    ok: true,
    googleSignIn: ctx.env.googleEnabled,
    emailDelivery: ctx.env.emailDelivery === "memory" ? "unconfigured" : ctx.env.emailDelivery,
    googleRedirectPath: "/api/auth/callback/google",
  };
}

export { authorizeQueuedRecordJob, assessAgeTransition, loadJurisdictionPolicy };

type PersonInput = ReturnType<typeof familyInputSchema.parse>["patients"][number];
type CoverageInput = NonNullable<ReturnType<typeof coverageSaveSchema.parse>["records"]>[number];
type Database = AppDatabase;

async function upsertPerson(
  tx: Database,
  ctx: AppContext,
  actor: Actor,
  householdId: string,
  person: PersonInput,
  now: Date,
) {
  const birthDate = assertRealDate(person.birthDate, "birthDate", { notFuture: true, now });
  const [saved] = await tx
    .insert(patient)
    .values({
      id: randomUUID(),
      householdId,
      clientKey: person.clientKey,
      givenName: person.givenName,
      familyName: person.familyName,
      preferredName: person.preferredName,
      birthDate,
      relationship: person.relationship,
      authorityCategory: person.authorityCategory,
      profileState: person.authorityCategory === "self" ? "active" : person.authorityCategory === "adult_invitation" ? "pending_invitation" : "pending_authority",
      createdByUserId: actor.id,
      provenance: "account_holder_entered",
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [patient.householdId, patient.clientKey],
      set: {
        givenName: person.givenName,
        familyName: person.familyName,
        preferredName: person.preferredName,
        birthDate,
        relationship: person.relationship,
        updatedAt: now,
        version: sql`${patient.version} + 1`,
      },
    })
    .returning();
  if (!saved) throw new HttpError(500, "internal", "The profile could not be saved.");
  if (saved.authorityCategory !== person.authorityCategory) {
    throw new HttpError(409, "category_locked", "A saved person's access type cannot be changed. Remove the pending profile and add it again.");
  }
  if (person.authorityCategory === "self") {
    await upsertGrant(tx, {
      patientId: saved.id,
      userId: actor.id,
      scopes: SELF_SCOPES,
      authorityBasis: "self",
      now,
      onlyIfMissing: true,
    });
  }
  if (person.authorityCategory === "adult_invitation") {
    const scopes = person.requestedScopes?.length ? person.requestedScopes : DEFAULT_SHARED_SCOPES;
    const [openInvite] = await tx
      .select()
      .from(invitation)
      .where(and(eq(invitation.patientId, saved.id), inArray(invitation.status, ["draft", "sending", "sent", "send_failed"])))
      .limit(1);
    if (!openInvite) {
      await tx.insert(invitation).values({
        id: randomUUID(),
        householdId,
        patientId: saved.id,
        invitedEmail: person.invitedEmail!,
        requestedScopes: scopes,
        status: "draft",
        createdByUserId: actor.id,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    } else if (openInvite.status === "draft" || openInvite.status === "send_failed") {
      await tx
        .update(invitation)
        .set({ invitedEmail: person.invitedEmail!, requestedScopes: scopes, updatedAt: now, version: openInvite.version + 1 })
        .where(eq(invitation.id, openInvite.id));
    } else if (openInvite.invitedEmail !== person.invitedEmail) {
      throw new HttpError(409, "invitation_sent", "Cancel the sent invitation before changing the email address.");
    }
  }
  if (person.authorityCategory === "minor_representative" || person.authorityCategory === "dependent_adult_representative") {
    const [review] = await tx.select().from(authorityReview).where(eq(authorityReview.patientId, saved.id)).limit(1);
    if (!review) {
      await tx.insert(authorityReview).values({
        id: randomUUID(),
        patientId: saved.id,
        claimedByUserId: actor.id,
        relationshipLabel: person.relationship,
        claimedAuthority: person.authorityCategory,
        status: "pending_review",
        policyReference: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    const policy = await loadJurisdictionPolicy(tx);
    const assessment = assessAgeTransition(saved.birthDate, policy, now);
    if (assessment.outcome === "review_required") {
      await writeAudit(tx, now, {
        actorUserId: actor.id,
        householdId,
        eventName: "age_review_required",
        entityType: "patient",
        entityId: saved.id,
      });
    }
  }
}

async function upsertGrant(
  tx: Database,
  input: {
    patientId: string;
    userId: string;
    scopes: Scope[];
    authorityBasis: "self" | "invitation_accepted" | "representative_approved";
    now: Date;
    onlyIfMissing?: boolean;
  },
) {
  const [existing] = await tx
    .select()
    .from(accessGrant)
    .where(and(eq(accessGrant.patientId, input.patientId), eq(accessGrant.userId, input.userId)))
    .limit(1);
  if (!existing) {
    await tx.insert(accessGrant).values({
      id: randomUUID(),
      patientId: input.patientId,
      userId: input.userId,
      scopes: input.scopes,
      authorityBasis: input.authorityBasis,
      status: "active",
      grantedAt: input.now,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    });
    return;
  }
  if (input.onlyIfMissing || existing.status === "active") return;
  await tx
    .update(accessGrant)
    .set({
      status: "active",
      scopes: input.scopes,
      authorityBasis: input.authorityBasis,
      grantedAt: input.now,
      revokedAt: null,
      updatedAt: input.now,
      version: existing.version + 1,
    })
    .where(eq(accessGrant.id, existing.id));
}

async function upsertCoverage(
  tx: Database,
  ctx: AppContext,
  actor: Actor,
  householdId: string,
  record: CoverageInput,
  index: number,
  now: Date,
) {
  const start = normalizeDateField(record.start, `records.${index}.start`);
  const end = normalizeDateField(record.end, `records.${index}.end`);
  if (start.value && end.value && end.value < start.value) {
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
      [`records.${index}.end`]: "The end date cannot be earlier than the start date.",
    });
  }
  if (record.memberId && record.memberId.length > 64) {
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
      [`records.${index}.memberId`]: "Use 64 characters or fewer.",
    });
  }
  const people = await tx.select({ id: patient.id }).from(patient).where(eq(patient.householdId, householdId));
  const ids = new Set(people.map((item) => item.id));
  if (record.subscriberPatientId && !ids.has(record.subscriberPatientId)) {
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
      [`records.${index}.subscriberPatientId`]: "Choose a person from this household.",
    });
  }
  for (const coveredId of record.coveredPatientIds) {
    if (!ids.has(coveredId)) {
      throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
        [`records.${index}.coveredPatientIds`]: "Choose people from this household.",
      });
    }
  }
  const [saved] = await tx
    .insert(coverage)
    .values({
      id: randomUUID(),
      householdId,
      clientKey: record.clientKey,
      insurer: record.insurer,
      planName: record.planName,
      subscriberName: record.subscriberName,
      subscriberPatientId: record.subscriberPatientId || null,
      memberId: record.memberId,
      groupNumber: record.groupNumber,
      coverageStart: start.value,
      coverageEnd: end.value,
      startDateState: start.state,
      endDateState: end.state,
      version: 1,
      createdByUserId: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [coverage.householdId, coverage.clientKey],
      set: {
        insurer: record.insurer,
        planName: record.planName,
        subscriberName: record.subscriberName,
        subscriberPatientId: record.subscriberPatientId || null,
        memberId: record.memberId,
        groupNumber: record.groupNumber,
        coverageStart: start.value,
        coverageEnd: end.value,
        startDateState: start.state,
        endDateState: end.state,
        updatedAt: now,
        version: sql`${coverage.version} + 1`,
      },
    })
    .returning();
  if (!saved) throw new HttpError(500, "internal", "Coverage could not be saved.");
  await tx.insert(coverageVersion).values({
    id: randomUUID(),
    coverageId: saved.id,
    version: saved.version,
    snapshot: {
      insurer: saved.insurer,
      planName: saved.planName,
      subscriberName: saved.subscriberName,
      subscriberPatientId: saved.subscriberPatientId,
      memberId: saved.memberId,
      groupNumber: saved.groupNumber,
      coverageStart: saved.coverageStart,
      coverageEnd: saved.coverageEnd,
      startDateState: saved.startDateState,
      endDateState: saved.endDateState,
      coveredPatientIds: record.coveredPatientIds,
    },
    createdAt: now,
  });
  await tx.delete(coveragePatient).where(eq(coveragePatient.coverageId, saved.id));
  if (record.coveredPatientIds.length > 0) {
    await tx.insert(coveragePatient).values(
      record.coveredPatientIds.map((patientId) => ({ coverageId: saved.id, patientId })),
    );
  }
}

function validatePerson(person: PersonInput, index: number, organizingFor: OrganizingFor, now: Date) {
  const prefix = `patients.${index}`;
  assertRealDate(person.birthDate, `${prefix}.birthDate`, { notFuture: true, now });
  if (person.authorityCategory === "self") {
    if (organizingFor === "someone_else") {
      throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
        [`${prefix}.authorityCategory`]: "A caregiver-only account does not create a profile for the account holder.",
      });
    }
    if (person.relationship !== "self") {
      throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
        [`${prefix}.relationship`]: "Your own profile uses the relationship Self.",
      });
    }
    return;
  }
  if (organizingFor === "self") {
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
      [`${prefix}.authorityCategory`]: "This account is set up for you only. Change that choice before adding someone else.",
    });
  }
  if (person.relationship === "self") {
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
      [`${prefix}.relationship`]: "Choose how this person is related to you.",
    });
  }
  if (person.authorityCategory === "adult_invitation") {
    if (!person.invitedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.invitedEmail)) {
      throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
        [`${prefix}.invitedEmail`]: "Enter the adult's email. The invitation stays unsent until you choose Send.",
      });
    }
  }
}

function assertFamilyComplete(organizingFor: OrganizingFor, people: { authorityCategory: string }[]) {
  if (!familyIsValid(organizingFor, people)) {
    if (organizingFor === "someone_else") {
      throw new HttpError(422, "invalid_fields", "Add the person whose care you are organizing.", {
        form: "Add at least one person. This account will not create a patient profile for you.",
      });
    }
    throw new HttpError(422, "invalid_fields", "Add your own profile before continuing.", {
      form: "Add your profile. A self profile is created only when you include yourself.",
    });
  }
}

function familyIsValid(organizingFor: OrganizingFor, people: { authorityCategory: string }[]) {
  const selfCount = people.filter((item) => item.authorityCategory === "self").length;
  if (organizingFor === "someone_else") return selfCount === 0 && people.length > 0;
  if (organizingFor === "self") return selfCount === 1 && people.every((item) => item.authorityCategory === "self");
  return selfCount === 1;
}

function normalizeDateField(
  field: { state: "unknown" } | { state: "known"; value: string },
  key: string,
): { state: "known" | "unknown"; value: string | null } {
  if (field.state === "unknown") return { state: "unknown", value: null };
  return { state: "known", value: assertRealDate(field.value, key) };
}

async function buildOnboardingBody(ctx: AppContext, actor: Actor, database: Database = ctx.db) {
  const state = await findState(database, actor.id);
  const [accountUser] = await database.select().from(user).where(eq(user.id, actor.id)).limit(1);
  const displayName = blankName(accountUser?.name ?? actor.name);
  const householdId = state?.householdId ?? null;
  const patients = householdId ? await loadPatientViews(database, actor, householdId, ctx.now()) : [];
  const coverageRecords = householdId ? await loadCoverageViews(database, householdId, true) : [];
  const currentStep = currentStepFor(state);
  return {
    ok: true,
    onboarding: {
      displayName,
      organizingFor: (state?.organizingFor as OrganizingFor | null) ?? null,
      currentStep,
      householdId,
      patients,
      coverage: coverageRecords,
      tasks: patients.flatMap((person) => person.tasks),
    },
  };
}

function currentStepFor(state: Awaited<ReturnType<typeof findState>>): Step {
  if (!state?.profileCompletedAt) return "profile";
  if (!state.familyCompletedAt) return "family";
  if (!state.coverageCompletedAt) return "coverage";
  if (!state.reviewCompletedAt) return "review";
  return "complete";
}

async function loadPatientViews(db: Database, actor: Actor, householdId: string, now: Date) {
  const people = await db.select().from(patient).where(eq(patient.householdId, householdId));
  const views = [];
  for (const person of people) {
    const [invite] = await db
      .select()
      .from(invitation)
      .where(eq(invitation.patientId, person.id))
      .orderBy(desc(invitation.createdAt))
      .limit(1);
    const [review] = await db.select().from(authorityReview).where(eq(authorityReview.patientId, person.id)).limit(1);
    const [grant] = await db
      .select()
      .from(accessGrant)
      .where(and(eq(accessGrant.patientId, person.id), eq(accessGrant.userId, actor.id)))
      .limit(1);
    const status = patientStatus(person.profileState, invite?.status ?? null, review?.status ?? null, grant?.status ?? null);
    const grantRows = await db.select().from(accessGrant).where(eq(accessGrant.patientId, person.id));
    const grants = [];
    for (const item of grantRows) {
      const [accountUser] = await db
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, item.userId))
        .limit(1);
      grants.push({
        userId: item.userId,
        status: item.status,
        scopes: item.scopes,
        authorityBasis: item.authorityBasis,
        displayName: blankName(accountUser?.name ?? ""),
        email: accountUser?.email ?? "",
      });
    }
    views.push({
      id: person.id,
      clientKey: person.clientKey,
      givenName: person.givenName,
      familyName: person.familyName,
      preferredName: person.preferredName,
      birthDate: person.birthDate,
      relationship: person.relationship,
      authorityCategory: person.authorityCategory,
      profileState: person.profileState,
      version: person.version,
      viewerGrantStatus: grant?.status ?? null,
      status,
      invitation: invite
        ? {
            id: invite.id,
            status: invite.status,
            invitedEmail: invite.invitedEmail,
            expiresAt: invite.expiresAt,
            requestedScopes: invite.requestedScopes,
          }
        : null,
      authorityReview: review
        ? { status: review.status, claimedAuthority: review.claimedAuthority, policyReference: review.policyReference }
        : null,
      tasks: tasksFor(person.id, status),
      protectedRecordAccess: grant?.status === "active" && !(grant.expiresAt && grant.expiresAt <= now),
      grants,
    });
  }
  return views;
}

function patientStatus(
  profileState: string,
  invitationStatus: string | null,
  reviewStatus: string | null,
  grantStatus: string | null,
) {
  if (grantStatus === "revoked") {
    return { code: "revoked", label: "Access revoked", detail: "Protected records are unavailable until access is authorized again." };
  }
  if (profileState === "pending_authority" || reviewStatus === "pending_review") {
    return {
      code: "authority_pending",
      label: "Authority review pending",
      detail: "Protected records stay unavailable until an approved policy authorizes this relationship. CareUnfold does not decide guardianship.",
    };
  }
  if (invitationStatus === "draft") {
    return { code: "invitation_draft", label: "Invitation not sent", detail: "Nothing is sent until you choose Send invitation." };
  }
  if (invitationStatus === "send_failed") {
    return { code: "invitation_send_failed", label: "Invitation not sent", detail: "The last send did not succeed. No access was granted." };
  }
  if (invitationStatus === "sent") {
    return { code: "invitation_sent", label: "Waiting for acceptance", detail: "Access stays pending until the invited adult accepts." };
  }
  if (invitationStatus === "rejected" || invitationStatus === "canceled" || invitationStatus === "expired") {
    return { code: `invitation_${invitationStatus}`, label: "No access granted", detail: "This invitation is closed and cannot be reused." };
  }
  if (profileState === "active" && grantStatus === "active") {
    return { code: "active", label: "Active access", detail: "Protected record intake is not part of this version." };
  }
  return { code: "pending", label: "Access pending", detail: "No protected records are available." };
}

function tasksFor(patientId: string, status: { code: string; label: string; detail: string }) {
  if (status.code === "active") return [];
  return [{ patientId, code: status.code, label: status.label, detail: status.detail }];
}

async function loadCoverageViews(db: Database, householdId: string, includeMemberId: boolean) {
  const records = await db.select().from(coverage).where(eq(coverage.householdId, householdId));
  const views = [];
  for (const record of records) {
    const links = await db.select().from(coveragePatient).where(eq(coveragePatient.coverageId, record.id));
    views.push({
      id: record.id,
      clientKey: record.clientKey,
      insurer: record.insurer,
      planName: record.planName,
      subscriberName: record.subscriberName,
      subscriberPatientId: record.subscriberPatientId,
      memberId: includeMemberId ? record.memberId : null,
      memberIdMasked: maskIdentifier(record.memberId),
      groupNumber: record.groupNumber,
      start: record.startDateState === "known" ? { state: "known", value: record.coverageStart } : { state: "unknown" },
      end: record.endDateState === "known" ? { state: "known", value: record.coverageEnd } : { state: "unknown" },
      coveredPatientIds: links.map((link) => link.patientId),
      version: record.version,
    });
  }
  return views;
}

async function householdAdminView(db: Database, actor: Actor, householdId: string, adminRole: string) {
  const [row] = await db.select().from(household).where(eq(household.id, householdId)).limit(1);
  const members = await db.select().from(householdMembership).where(eq(householdMembership.householdId, householdId));
  const memberViews = [];
  for (const member of members) {
    const [accountUser] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, member.userId)).limit(1);
    memberViews.push({
      userId: member.userId,
      adminRole: member.adminRole,
      email: accountUser?.email ?? "",
      displayName: blankName(accountUser?.name ?? ""),
    });
  }
  return {
    id: householdId,
    displayName: row?.displayName ?? "Household",
    origin: row?.origin ?? "user",
    yourAdminRole: adminRole,
    administrationNote: "A household role lets you manage the household. It does not grant access to a patient's protected records.",
    members: memberViews,
    patients: await loadPatientViews(db, actor, householdId, new Date()),
    coverage: await loadCoverageViews(db, householdId, adminRole === "owner" || adminRole === "admin"),
  };
}

async function listGrantedPatients(ctx: AppContext, actor: Actor) {
  const grants = await ctx.db
    .select()
    .from(accessGrant)
    .where(and(eq(accessGrant.userId, actor.id), eq(accessGrant.status, "active")));
  const results = [];
  for (const grant of grants) {
    const [person] = await ctx.db.select().from(patient).where(eq(patient.id, grant.patientId)).limit(1);
    if (!person) continue;
    results.push({
      patientId: person.id,
      givenName: person.givenName,
      familyName: person.familyName,
      scopes: grant.scopes,
      authorityBasis: grant.authorityBasis,
    });
  }
  return results;
}

async function findInvitationByToken(ctx: AppContext, token: string) {
  if (!token || token.length < 20) return null;
  const [row] = await ctx.db.select().from(invitation).where(eq(invitation.tokenHash, hashToken(token))).limit(1);
  return row ?? null;
}

async function requireOpenInvitation(ctx: AppContext, token: string, actor: Actor) {
  const row = await findInvitationByToken(ctx, token);
  if (!row) throw new HttpError(404, "invitation_unavailable", "This invitation is not available.");
  if (row.status === "sent" && row.expiresAt && row.expiresAt <= ctx.now()) {
    await ctx.db
      .update(invitation)
      .set({ status: "expired", resolvedAt: ctx.now(), updatedAt: ctx.now(), version: row.version + 1 })
      .where(eq(invitation.id, row.id));
    throw new HttpError(410, "invitation_expired", "This invitation has expired. Ask for a new one.");
  }
  if (row.status !== "sent") {
    throw new HttpError(409, "invitation_closed", "This invitation is no longer available and cannot be used again.");
  }
  if (actor.email.toLowerCase() !== row.invitedEmail) {
    throw new HttpError(403, "invitation_email_mismatch", "Sign in with the email address that received this invitation.");
  }
  return row;
}

async function expireSentInvitations(ctx: AppContext, userId: string) {
  const memberships = await ctx.db
    .select({ householdId: householdMembership.householdId })
    .from(householdMembership)
    .where(eq(householdMembership.userId, userId));
  const householdIds = memberships.map((item) => item.householdId);
  if (householdIds.length === 0) return;
  const rows = await ctx.db
    .select()
    .from(invitation)
    .where(and(inArray(invitation.householdId, householdIds), eq(invitation.status, "sent")));
  for (const row of rows) {
    if (row.expiresAt && row.expiresAt <= ctx.now()) {
      await ctx.db
        .update(invitation)
        .set({ status: "expired", resolvedAt: ctx.now(), updatedAt: ctx.now(), version: row.version + 1 })
        .where(eq(invitation.id, row.id));
    }
  }
}

async function findState(db: Database, userId: string) {
  const [state] = await db.select().from(onboardingState).where(eq(onboardingState.userId, userId)).limit(1);
  return state ?? null;
}

async function requireHouseholdState(db: Database, userId: string) {
  const state = await findState(db, userId);
  if (!state?.householdId || !state.profileCompletedAt || !state.organizingFor) {
    throw new HttpError(409, "step_incomplete", "Save your profile before this step.");
  }
  return state;
}

async function findMembership(db: Database, userId: string, householdId: string) {
  const [membership] = await db
    .select()
    .from(householdMembership)
    .where(and(eq(householdMembership.userId, userId), eq(householdMembership.householdId, householdId)))
    .limit(1);
  return membership ?? null;
}

async function requireAdmin(db: Database, userId: string, householdId: string, roles: string[]) {
  const membership = await findMembership(db, userId, householdId);
  if (!membership) throw new HttpError(404, "not_found", "That household was not found.");
  if (!roles.includes(membership.adminRole)) {
    throw new HttpError(403, "forbidden", "You do not administer this household.");
  }
  return membership;
}

async function assertRate(db: Database, userId: string, action: string, limit: number, windowMs: number, now: Date) {
  const since = new Date(now.getTime() - windowMs);
  const recent = await db
    .select({ id: actionRate.id })
    .from(actionRate)
    .where(and(eq(actionRate.userId, userId), eq(actionRate.action, action), gt(actionRate.createdAt, since)));
  if (recent.length >= limit) {
    throw new HttpError(429, "rate_limited", "Too many attempts. Wait a little, then try again.");
  }
  await db.insert(actionRate).values({ id: randomUUID(), userId, action, createdAt: now });
}

async function writeAudit(
  db: Database,
  now: Date,
  event: { actorUserId: string; householdId: string | null; eventName: string; entityType: string; entityId: string },
) {
  await db.insert(auditEvent).values({
    id: randomUUID(),
    actorUserId: event.actorUserId,
    householdId: event.householdId,
    eventName: event.eventName,
    entityType: event.entityType,
    entityId: event.entityId,
    createdAt: now,
  });
}

async function withIdempotency(
  ctx: AppContext,
  userId: string,
  route: string,
  key: string,
  raw: unknown,
  work: (tx: Database) => Promise<CommandResult>,
): Promise<CommandResult> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    throw new HttpError(400, "idempotency_key_required", "Retry this save from the form so it can be applied once.");
  }
  const requestHash = createHash("sha256").update(canonicalJson(raw)).digest("hex");
  return ctx.db.transaction(async (tx) => {
    const database = tx as unknown as Database;
    const [existing] = await database
      .select()
      .from(idempotencyKey)
      .where(and(eq(idempotencyKey.userId, userId), eq(idempotencyKey.route, route), eq(idempotencyKey.key, key)))
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new HttpError(409, "idempotency_conflict", "This save was already used for different information. Reload and try again.");
      }
      return { status: existing.responseStatus, body: existing.responseBody as Record<string, unknown> };
    }
    const result = await work(database);
    await database.insert(idempotencyKey).values({
      id: randomUUID(),
      userId,
      route,
      key,
      requestHash,
      responseStatus: result.status,
      responseBody: result.body,
      createdAt: ctx.now(),
    });
    return result;
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requireVerified(actor: Actor) {
  if (!actor.emailVerified) {
    throw new HttpError(403, "email_unverified", "Verify your email before continuing.");
  }
}

function blankName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function maskIdentifier(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 2) return "••";
  return `••${value.slice(-2)}`;
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "profile.read":
      return "View profile";
    case "profile.write":
      return "Edit profile";
    case "coverage.read":
      return "View coverage";
    case "coverage.write":
      return "Edit coverage";
    case "records.read":
      return "View records";
    case "records.write":
      return "Add or correct records";
    default:
      return "Requested permission";
  }
}

export async function countUsers(ctx: AppContext) {
  const rows = await ctx.db.select({ id: user.id }).from(user);
  return rows.length;
}

export async function countPatients(ctx: AppContext, householdId: string) {
  const rows = await ctx.db.select({ id: patient.id }).from(patient).where(eq(patient.householdId, householdId));
  return rows.length;
}
