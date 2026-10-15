import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { createAuth } from "@/server/auth/create-auth";
import { user } from "@/server/db/schema";
import { applyMigrations } from "@/server/db/client";
import { clearMemoryMailbox, createEmailSender, readMemoryMailbox } from "@/server/email/delivery";
import { readEnv, type AppEnv } from "@/server/env";
import { dispatch } from "@/server/http/router";
import type { AppContext } from "@/server/domain/service";

export const origin = "http://localhost:3000";
export const password = "Harbor-Light-42";

export async function createTestContext(envOverrides: Partial<AppEnv> = {}) {
  const env = { ...readEnv(), ...envOverrides };
  const opened = await applyMigrations(env.databaseUrl, path.join(process.cwd(), "drizzle"));
  let now = new Date("2026-10-08T15:00:00.000Z");
  const email = createEmailSender({
    mode: "memory",
    db: opened.db,
    resendApiKey: null,
    emailFrom: null,
    now: () => now,
  });
  const auth = createAuth({ db: opened.db, env, email });
  const ctx: AppContext = { db: opened.db, auth, email, env, now: () => now };
  return {
    ctx,
    env,
    close: opened.close,
    setNow(value: Date) {
      now = value;
    },
    getNow() {
      return now;
    },
  };
}

export async function resetData(ctx: AppContext) {
  clearMemoryMailbox();
  await ctx.db.execute(sql`
    TRUNCATE TABLE
      privacy_request,
      dev_email_outbox,
      audit_event,
      idempotency_key,
      action_rate,
      coverage_patient,
      coverage_version,
      coverage,
      authority_review,
      access_grant,
      invitation,
      patient,
      account_preference,
      onboarding_state,
      household_membership,
      household,
      verification,
      session,
      account,
      "user"
    CASCADE
  `);
}

export async function api(
  ctx: AppContext,
  pathName: string,
  init: { method?: string; cookie?: string; body?: unknown; idempotencyKey?: string } = {},
) {
  const headers = new Headers({ origin });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  const response = await dispatch(
    new Request(`${origin}${pathName}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    }),
    ctx,
  );
  return { status: response.status, data: await response.json() };
}

export function jsonRequest(pathName: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const headers = new Headers({ origin, "content-type": "application/json", ...extraHeaders });
  return new Request(`${origin}${pathName}`, { method: "POST", headers, body: JSON.stringify(body) });
}

export async function authRequest(ctx: AppContext, pathName: string, init: { body?: unknown; cookie?: string } = {}) {
  return ctx.auth.handler(
    jsonRequest(`/api/auth${pathName}`, init.body ?? {}, init.cookie ? { cookie: init.cookie } : {}),
  );
}

export function cookiesFrom(response: Response): string {
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return cookies.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
}

export function linkFromMailbox(purpose: string): string {
  const message = readMemoryMailbox().find((item) => item.purpose === purpose);
  const link = message?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`Missing ${purpose} link`);
  return link;
}

export function tokenFromMailbox(): string {
  const link = new URL(linkFromMailbox("invitation"));
  const token = link.pathname.split("/").pop();
  if (!token) throw new Error("Missing invitation token");
  return token;
}

export async function register(ctx: AppContext, email: string) {
  clearMemoryMailbox();
  const signUp = await authRequest(ctx, "/sign-up/email", {
    body: { name: "", email, password, callbackURL: "/verify-email" },
  });
  const signUpBody = await signUp.json();
  const verify = await ctx.auth.handler(new Request(linkFromMailbox("verify_email")));
  await approveAccess(ctx, email);
  return { signUp, signUpBody, cookie: cookiesFrom(verify), email };
}

export async function registerPending(ctx: AppContext, email: string) {
  clearMemoryMailbox();
  const signUp = await authRequest(ctx, "/sign-up/email", {
    body: { name: "", email, password, callbackURL: "/verify-email" },
  });
  const signUpBody = await signUp.json();
  const verify = await ctx.auth.handler(new Request(linkFromMailbox("verify_email")));
  return { signUp, signUpBody, cookie: cookiesFrom(verify), email };
}

export async function approveAccess(ctx: AppContext, email: string, status: "approved" | "denied" = "approved") {
  const [row] = await ctx.db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!row) throw new Error(`No account stored for ${email}`);
  await ctx.db
    .update(user)
    .set({ accessStatus: status, accessReviewedAt: ctx.now(), updatedAt: ctx.now() })
    .where(eq(user.id, row.id));
}

export async function signIn(ctx: AppContext, email: string, nextPassword = password) {
  const response = await authRequest(ctx, "/sign-in/email", { body: { email, password: nextPassword } });
  return { response, cookie: cookiesFrom(response), body: await response.clone().json() };
}

export function selfPatient(clientKey: string) {
  return {
    clientKey,
    givenName: "Avery",
    familyName: "Quinn",
    preferredName: null,
    birthDate: "1990-03-04",
    relationship: "self",
    authorityCategory: "self",
  };
}

export function adultPatient(clientKey: string, email: string, requestedScopes?: string[]) {
  return {
    clientKey,
    givenName: "Jordan",
    familyName: "Quinn",
    preferredName: "Jo",
    birthDate: "1988-07-09",
    relationship: "spouse",
    authorityCategory: "adult_invitation",
    invitedEmail: email,
    requestedScopes,
  };
}

export async function saveProfile(
  ctx: AppContext,
  cookie: string,
  displayName: string,
  organizingFor: string,
  extra: Record<string, unknown> = {},
) {
  return api(ctx, "/api/onboarding/profile", {
    method: "POST",
    cookie,
    idempotencyKey: `profile-${displayName.replace(/\s+/g, "-").toLowerCase()}`,
    body: { displayName, organizingFor, ...extra },
  });
}
