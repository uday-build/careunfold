import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client";
import { accessGrant, householdMembership, jurisdictionPolicy, patient } from "../db/schema";
import type { Scope } from "./validation";
import { isUuid } from "./validation";

export type Actor = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export type AccessDenial = {
  allowed: false;
  status: 403 | 404;
  code: string;
  message: string;
};

export type AccessDecision = { allowed: true; grantId: string } | AccessDenial;

const notFound: AccessDenial = {
  allowed: false,
  status: 404,
  code: "not_found",
  message: "That record was not found.",
};

export async function decidePatientAccess(
  db: AppDatabase,
  actor: Actor,
  patientId: string,
  scope: Scope,
  now: Date,
): Promise<AccessDecision> {
  if (!actor.emailVerified) {
    return {
      allowed: false,
      status: 403,
      code: "email_unverified",
      message: "Verify your email before opening protected records.",
    };
  }
  if (!isUuid(patientId)) return notFound;
  const [found] = await db.select().from(patient).where(eq(patient.id, patientId)).limit(1);
  if (!found) return notFound;

  const [grant] = await db
    .select()
    .from(accessGrant)
    .where(and(eq(accessGrant.patientId, patientId), eq(accessGrant.userId, actor.id)))
    .limit(1);
  const [membership] = await db
    .select()
    .from(householdMembership)
    .where(and(eq(householdMembership.householdId, found.householdId), eq(householdMembership.userId, actor.id)))
    .limit(1);

  if (grant?.status === "active" && grant.expiresAt && grant.expiresAt <= now) {
    await db
      .update(accessGrant)
      .set({ status: "expired", updatedAt: now, version: grant.version + 1 })
      .where(eq(accessGrant.id, grant.id));
    return denialForKnownPatient(Boolean(membership), "access_expired", "Access to this person's records has expired.");
  }

  if (grant?.status === "active" && grant.scopes.includes(scope)) {
    return { allowed: true, grantId: grant.id };
  }
  if (grant?.status === "active") {
    return denialForKnownPatient(true, "scope_denied", "This account does not include that permission.");
  }
  if (grant) {
    return denialForKnownPatient(
      true,
      "access_revoked",
      "Access to this person's protected records is not active.",
    );
  }
  if (membership) {
    return denialForKnownPatient(
      true,
      "grant_required",
      "Household administration does not include this person's protected records.",
    );
  }
  return notFound;
}

function denialForKnownPatient(known: boolean, code: string, message: string): AccessDenial {
  if (!known) return notFound;
  return { allowed: false, status: 403, code, message };
}

export async function authorizeQueuedRecordJob(
  db: AppDatabase,
  actor: Actor,
  patientId: string,
  now: Date,
): Promise<{ queued: false; decision: AccessDecision }> {
  const decision = await decidePatientAccess(db, actor, patientId, "records.read", now);
  return { queued: false, decision };
}

export type AgeAssessment =
  | { outcome: "policy_not_configured" }
  | { outcome: "review_required"; reviewAgeYears: number }
  | { outcome: "no_transition"; reviewAgeYears: number };

export async function loadJurisdictionPolicy(db: AppDatabase) {
  const [policy] = await db.select().from(jurisdictionPolicy).where(eq(jurisdictionPolicy.id, "default")).limit(1);
  return policy ?? { configured: false, reviewAgeYears: null as number | null };
}

export function assessAgeTransition(
  birthDate: string,
  policy: { configured: boolean; reviewAgeYears: number | null },
  now: Date,
): AgeAssessment {
  if (!policy.configured || policy.reviewAgeYears == null) {
    return { outcome: "policy_not_configured" };
  }
  const age = ageInYears(birthDate, now);
  if (age >= policy.reviewAgeYears) return { outcome: "review_required", reviewAgeYears: policy.reviewAgeYears };
  return { outcome: "no_transition", reviewAgeYears: policy.reviewAgeYears };
}

function ageInYears(birthDate: string, now: Date): number {
  const today = now.toISOString().slice(0, 10);
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  const birthdayThisYear = `${today.slice(0, 4)}${birthDate.slice(4)}`;
  return today >= birthdayThisYear ? years : years - 1;
}
