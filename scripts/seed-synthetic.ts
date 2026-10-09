import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createAuth } from "../src/server/auth/create-auth";
import { applyMigrations } from "../src/server/db/client";
import { household, onboardingState, user } from "../src/server/db/schema";
import { createEmailSender } from "../src/server/email/delivery";
import { readEnv } from "../src/server/env";
import { completeReview, saveCoverageStep, saveFamily, saveProfile, type AppContext } from "../src/server/domain/service";

const ownerEmail = "fixture.owner@example.test";
const adultEmail = "fixture.adult@example.test";

async function main() {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    console.error("Synthetic fixtures are refused in production.");
    process.exit(1);
  }
  const password = process.env.SYNTHETIC_FIXTURE_PASSWORD?.trim() ?? "";
  if (password.length < 12) {
    console.error("Set SYNTHETIC_FIXTURE_PASSWORD in .env.local to at least 12 characters. The password is not printed.");
    process.exit(1);
  }
  const env = readEnv();
  const opened = await applyMigrations(env.databaseUrl, path.join(process.cwd(), "drizzle"));
  const email = createEmailSender({
    mode: "memory",
    db: opened.db,
    resendApiKey: null,
    emailFrom: null,
    now: () => new Date(),
  });
  const auth = createAuth({ db: opened.db, env, email });
  const ctx: AppContext = { db: opened.db, auth, email, env, now: () => new Date() };
  try {
    const owner = await ensureUser(ctx, ownerEmail, password, "Fixture Owner");
    await ensureUser(ctx, adultEmail, password, "Fixture Adult");
    const [state] = await ctx.db.select().from(onboardingState).where(eq(onboardingState.userId, owner.id)).limit(1);
    if (state?.reviewCompletedAt) {
      console.log(`Synthetic fixture already exists for ${ownerEmail}. Sign in yourself. No session was created.`);
      return;
    }
    if (state?.profileCompletedAt) {
      console.error("A partial synthetic fixture exists. Remove the local database, or delete these fixture accounts, before seeding again.");
      process.exit(1);
    }
    const actor = { id: owner.id, email: owner.email, name: "Fixture Owner", emailVerified: true };
    const profile = await saveProfile(ctx, actor, { displayName: "Fixture Owner", organizingFor: "both" }, randomUUID());
    const householdId = (profile.body as { onboarding?: { householdId?: string | null } }).onboarding?.householdId;
    if (!householdId) throw new Error("Fixture household was not saved.");
    await saveFamily(
      ctx,
      actor,
      {
        patients: [
          {
            clientKey: "fixture-self",
            givenName: "Fixture",
            familyName: "Owner",
            preferredName: null,
            birthDate: "1984-03-12",
            relationship: "self",
            authorityCategory: "self",
          },
          {
            clientKey: "fixture-adult",
            givenName: "Fixture",
            familyName: "Adult",
            preferredName: null,
            birthDate: "1991-11-02",
            relationship: "spouse",
            authorityCategory: "adult_invitation",
            invitedEmail: adultEmail,
          },
          {
            clientKey: "fixture-minor",
            givenName: "Fixture",
            familyName: "Minor",
            preferredName: null,
            birthDate: "2016-07-19",
            relationship: "child",
            authorityCategory: "minor_representative",
          },
        ],
      },
      randomUUID(),
    );
    await saveCoverageStep(ctx, actor, { skip: true }, randomUUID());
    await completeReview(ctx, actor, {}, randomUUID());
    await ctx.db.update(household).set({ origin: "synthetic_fixture" }).where(eq(household.id, householdId));
    console.log(`Synthetic fixture saved for ${ownerEmail} and ${adultEmail}.`);
    console.log("The adult invitation is a draft and was not sent.");
    console.log("Sign in yourself with SYNTHETIC_FIXTURE_PASSWORD. No session was created.");
  } finally {
    await opened.close();
  }
}

async function ensureUser(ctx: AppContext, emailAddress: string, password: string, name: string) {
  const [existing] = await ctx.db.select().from(user).where(eq(user.email, emailAddress)).limit(1);
  if (existing) {
    if (!existing.emailVerified) {
      await ctx.db.update(user).set({ emailVerified: true, name }).where(eq(user.id, existing.id));
    }
    return { ...existing, emailVerified: true, name };
  }
  const created = await ctx.auth.api.signUpEmail({
    body: { email: emailAddress, password, name },
  });
  if (!created?.user?.id) {
    throw new Error("The fixture account was not stored.");
  }
  await ctx.db.update(user).set({ emailVerified: true, name }).where(eq(user.id, created.user.id));
  const [stored] = await ctx.db.select().from(user).where(eq(user.id, created.user.id)).limit(1);
  if (!stored) throw new Error("The fixture account was not stored.");
  return stored;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exit(1);
});
