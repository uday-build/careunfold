import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth, type Auth } from "@/server/auth/create-auth";
import { account, session, user } from "@/server/db/schema";
import { readMemoryMailbox } from "@/server/email/delivery";
import type { AppContext } from "@/server/domain/service";
import { api, approveAccess, authRequest, cookiesFrom, createTestContext, jsonRequest, origin, password, register, resetData, signIn } from "./support";

const googleTokenEndpoint = "https://oauth2.googleapis.com/token";

let ctx: AppContext;
let googleAuth: Auth;
let closeDatabase: () => Promise<void>;
let tokenRequests: URLSearchParams[] = [];

type GoogleProfile = { sub: string; email: string; email_verified: boolean; name: string; picture?: string };

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
  googleAuth = createAuth({
    db: ctx.db,
    env: {
      ...ctx.env,
      googleEnabled: true,
      googleClientId: "test-client.apps.googleusercontent.com",
      googleClientSecret: "test-secret",
    },
    email: ctx.email,
  });
});

beforeEach(async () => {
  tokenRequests = [];
  await resetData(ctx);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await closeDatabase();
});

function stubGoogle(profile: GoogleProfile) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== googleTokenEndpoint) return realFetch(input, init);
    tokenRequests.push(new URLSearchParams(String(init?.body ?? "")));
    const now = Math.floor(Date.now() / 1000);
    const idToken = unsignedJwt({
      iss: "https://accounts.google.com",
      aud: "test-client.apps.googleusercontent.com",
      iat: now,
      exp: now + 3600,
      ...profile,
    });
    return new Response(
      JSON.stringify({ access_token: "google-access", expires_in: 3599, token_type: "Bearer", scope: "openid email profile", id_token: idToken }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

async function completeGoogle(returnTo: "/sign-up" | "/sign-in", profile: GoogleProfile) {
  stubGoogle(profile);
  const started = await googleAuth.handler(
    jsonRequest("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL: "/auth/continue",
      newUserCallbackURL: "/auth/continue",
      errorCallbackURL: returnTo,
      disableRedirect: true,
    }),
  );
  expect(started.status).toBe(200);
  const authorizationUrl = new URL((await started.json()).url as string);
  expect(authorizationUrl.origin).toBe("https://accounts.google.com");
  expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
  expect((authorizationUrl.searchParams.get("scope") ?? "").split(" ").sort()).toEqual(["email", "openid", "profile"]);
  const stateCookie = cookiesFrom(started);
  const callback = await googleAuth.handler(
    new Request(
      `${origin}/api/auth/callback/google?code=google-code&state=${authorizationUrl.searchParams.get("state")}`,
      { headers: { cookie: stateCookie } },
    ),
  );
  return { callback, location: callback.headers.get("location") ?? "", cookie: cookiesFrom(callback) };
}

describe("account options", () => {
  it("creates a verified account from a new Google login and resumes onboarding", async () => {
    const result = await completeGoogle("/sign-up", {
      sub: "google-sub-1",
      email: "new.google@example.com",
      email_verified: true,
      name: "Riley Google",
    });
    expect(result.location).toContain("/auth/continue");
    expect(result.cookie).toContain("session_token=");
    expect(tokenRequests[0]?.get("code")).toBe("google-code");
    expect(tokenRequests[0]?.get("code_verifier")).toBeTruthy();

    const users = await ctx.db.select().from(user);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "new.google@example.com", emailVerified: true, name: "Riley Google" });
    const accounts = await ctx.db.select().from(account);
    expect(accounts.map((item) => item.providerId)).toEqual(["google"]);
    expect(accounts[0]?.accountId).toBe("google-sub-1");
    expect(accounts[0]?.password).toBeNull();
    expect(accounts[0]?.accessToken).not.toBe("google-access");
    expect(readMemoryMailbox()).toHaveLength(0);

    const waiting = await api(ctx, "/api/me", { cookie: result.cookie });
    expect(waiting.status).toBe(200);
    expect(waiting.data.home).toBe("/pending-access");
    expect(waiting.data.user.displayName).toBe("Riley Google");
    expect(waiting.data.user.accessStatus).toBe("pending");
    await approveAccess(ctx, "new.google@example.com");
    const me = await api(ctx, "/api/me", { cookie: result.cookie });
    expect(me.data.home).toBe("/onboarding/profile");
  });

  it("signs a returning Google user into the same account", async () => {
    const profile = { sub: "google-sub-2", email: "returning@example.com", email_verified: true, name: "Sam Return" };
    const first = await completeGoogle("/sign-up", profile);
    await approveAccess(ctx, "returning@example.com");
    const saved = await api(ctx, "/api/onboarding/profile", {
      method: "POST",
      cookie: first.cookie,
      idempotencyKey: "google-profile-1",
      body: { displayName: "Sam Return", organizingFor: "self" },
    });
    expect(saved.status).toBe(200);

    const second = await completeGoogle("/sign-in", profile);
    expect(second.cookie).toContain("session_token=");
    expect(await ctx.db.select().from(user)).toHaveLength(1);
    expect(await ctx.db.select().from(account)).toHaveLength(1);
    const me = await api(ctx, "/api/me", { cookie: second.cookie });
    expect(me.data.home).toBe("/onboarding/family");
  });

  it("does not attach Google to an existing password account with the same email", async () => {
    await register(ctx, "shared@example.com");
    const result = await completeGoogle("/sign-in", {
      sub: "google-sub-3",
      email: "shared@example.com",
      email_verified: true,
      name: "Someone Else",
    });
    expect(result.location).toContain("/sign-in");
    expect(new URL(result.location, origin).searchParams.get("error")).toBe("account_not_linked");
    expect(result.cookie).not.toContain("session_token=");
    const accounts = await ctx.db.select().from(account);
    expect(accounts.map((item) => item.providerId)).toEqual(["credential"]);
    const [stored] = await ctx.db.select().from(user).where(eq(user.email, "shared@example.com"));
    expect(stored?.name).toBe("");
    const passwordLogin = await signIn(ctx, "shared@example.com");
    expect(passwordLogin.response.status).toBe(200);
  });

  it("refuses a Google login whose email Google has not verified", async () => {
    const result = await completeGoogle("/sign-up", {
      sub: "google-sub-4",
      email: "unverified@example.com",
      email_verified: false,
      name: "Unverified",
    });
    expect(result.cookie).not.toContain("session_token=");
    expect(new URL(result.location, origin).pathname).toBe("/sign-up");
    expect(await ctx.db.select().from(session)).toHaveLength(0);
    const users = await ctx.db.select().from(user);
    expect(users.every((item) => !item.emailVerified)).toBe(true);
  });

  it("returns a canceled Google sign-up to the sign-up page without an account", async () => {
    const started = await googleAuth.handler(
      jsonRequest("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/auth/continue",
        errorCallbackURL: "/sign-up",
        disableRedirect: true,
      }),
    );
    const state = new URL((await started.json()).url as string).searchParams.get("state");
    const canceled = await googleAuth.handler(
      new Request(`${origin}/api/auth/callback/google?error=access_denied&state=${state}`, {
        headers: { cookie: cookiesFrom(started) },
      }),
    );
    const location = new URL(canceled.headers.get("location") ?? "", origin);
    expect(location.pathname).toBe("/sign-up");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(await ctx.db.select().from(user)).toHaveLength(0);
  });

  it("creates an email and password account that opens only after verification", async () => {
    const signUp = await authRequest(ctx, "/sign-up/email", {
      body: { name: "", email: "email.user@example.com", password, callbackURL: "/verify-email" },
    });
    expect(signUp.status).toBe(200);
    expect(cookiesFrom(signUp)).not.toContain("session_token=");
    const blocked = await signIn(ctx, "email.user@example.com");
    expect(blocked.response.status).toBe(403);
    expect(blocked.cookie).not.toContain("session_token=");

    const verified = await register(ctx, "email.user2@example.com");
    expect(verified.cookie).toContain("session_token=");
    const accounts = await ctx.db.select().from(account);
    expect(accounts.every((item) => item.providerId === "credential")).toBe(true);
    const login = await signIn(ctx, "email.user2@example.com");
    expect(login.response.status).toBe(200);
    const me = await api(ctx, "/api/me", { cookie: login.cookie });
    expect(me.data.home).toBe("/onboarding/profile");
  });
});

function unsignedJwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT", kid: "test" })}.${encode(payload)}.signature`;
}
