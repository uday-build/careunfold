import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { AppDatabase } from "../db/client";
import { authSchema } from "../db/schema";
import type { EmailSender } from "../email/delivery";
import type { AppEnv } from "../env";

export type CreateAuthInput = {
  db: AppDatabase;
  env: AppEnv;
  email: EmailSender;
};

export function createAuth(input: CreateAuthInput) {
  const google = input.env.googleEnabled
    ? {
        clientId: input.env.googleClientId ?? "",
        clientSecret: input.env.googleClientSecret ?? "",
        requireEmailVerification: true,
        accessType: "online" as const,
        prompt: "select_account" as const,
        includeGrantedScopes: false,
      }
    : undefined;

  return betterAuth({
    appName: "CareUnfold",
    baseURL: input.env.authUrl,
    secret: input.env.authSecret,
    trustedOrigins: input.env.trustedOrigins,
    database: drizzleAdapter(input.db, {
      provider: "pg",
      schema: authSchema,
    }),
    logger: {
      level: "error",
      log(level, message, ...args) {
        const text = redact(String(message));
        const extra = args.map((item) => redact(safeString(item)));
        console[level === "error" ? "error" : "warn"](text, ...extra);
      },
    },
    session: {
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        trustedProviders: [],
        allowDifferentEmails: false,
        updateUserInfoOnLink: false,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: input.env.resetExpiresIn,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await input.email.send({
          to: user.email,
          purpose: "reset_password",
          subject: "Reset your CareUnfold password",
          text: `Use this link to choose a new CareUnfold password. It expires and works once.\n\n${url}\n\nIf you did not ask for this, you can ignore it.`,
        });
      },
      onExistingUserSignUp: async ({ user }) => {
        try {
          await input.email.send({
            to: user.email,
            purpose: "existing_account",
            subject: "Sign in to CareUnfold",
            text: "Someone tried to create a CareUnfold account with this email. If that was you, sign in or reset your password. If it was not you, you can ignore this message.",
          });
        } catch {
          // The public sign-up response stays generic either way.
        }
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: input.env.verificationExpiresIn,
      sendVerificationEmail: async ({ user, url }) => {
        await input.email.send({
          to: user.email,
          purpose: "verify_email",
          subject: "Verify your CareUnfold email",
          text: `Verify your email to finish creating your CareUnfold account. This link expires and is single-use.\n\n${url}`,
        });
      },
    },
    socialProviders: google ? { google } : undefined,
    rateLimit: {
      enabled: input.env.nodeEnv !== "test",
      window: 60,
      max: 30,
      customRules: {
        "/sign-up/email": { window: 600, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 600, max: 5 },
        "/send-verification-email": { window: 600, max: 5 },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

function redact(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/token=[^&\s]+/gi, "token=[redacted]");
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "[unprintable]";
  }
}
