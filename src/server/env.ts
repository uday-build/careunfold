export type EmailDeliveryMode = "resend" | "dev-sink" | "memory" | "unconfigured";

export type AppEnv = {
  nodeEnv: string;
  databaseUrl: string;
  authSecret: string;
  authUrl: string;
  trustedOrigins: string[];
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleEnabled: boolean;
  resendApiKey: string | null;
  emailFrom: string | null;
  emailDelivery: EmailDeliveryMode;
  verificationExpiresIn: number;
  resetExpiresIn: number;
  invitationExpiresInMs: number;
  adminEmail: string | null;
};

const DEV_SECRET_MIN = 32;

export function readEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const nodeEnv = source.NODE_ENV ?? "development";
  const databaseUrl = source.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env.local and set it.");
  }
  const authSecret = source.BETTER_AUTH_SECRET?.trim() ?? "";
  if (authSecret.length < DEV_SECRET_MIN) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32");
  }
  const authUrl = (source.BETTER_AUTH_URL?.trim() || (nodeEnv === "production" ? "" : "http://localhost:3000")).replace(/\/$/, "");
  if (!authUrl) {
    throw new Error("BETTER_AUTH_URL is required in production.");
  }
  const googleClientId = blankToNull(source.GOOGLE_CLIENT_ID);
  const googleClientSecret = blankToNull(source.GOOGLE_CLIENT_SECRET);
  const googleEnabled = Boolean(googleClientId && googleClientSecret);
  const resendApiKey = blankToNull(source.RESEND_API_KEY);
  const emailFrom = blankToNull(source.EMAIL_FROM);
  const emailDelivery = resolveEmailDelivery({
    nodeEnv,
    requested: source.EMAIL_DELIVERY?.trim(),
    resendApiKey,
    emailFrom,
  });
  const origin = new URL(authUrl).origin;
  return {
    nodeEnv,
    databaseUrl,
    authSecret,
    authUrl,
    trustedOrigins: [origin],
    googleClientId,
    googleClientSecret,
    googleEnabled,
    resendApiKey,
    emailFrom,
    emailDelivery,
    verificationExpiresIn: numberFrom(source.AUTH_VERIFICATION_EXPIRES_IN, 60 * 60),
    resetExpiresIn: numberFrom(source.AUTH_RESET_EXPIRES_IN, 60 * 60),
    invitationExpiresInMs: numberFrom(source.INVITATION_EXPIRES_IN_HOURS, 24 * 7) * 60 * 60 * 1000,
    adminEmail: blankToNull(source.ADMIN_EMAIL)?.toLowerCase() ?? null,
  };
}

function resolveEmailDelivery(input: {
  nodeEnv: string;
  requested: string | undefined;
  resendApiKey: string | null;
  emailFrom: string | null;
}): EmailDeliveryMode {
  if (input.requested === "memory") {
    if (input.nodeEnv === "production") {
      throw new Error("EMAIL_DELIVERY=memory is only for automated tests.");
    }
    return "memory";
  }
  if (input.requested === "dev-sink") {
    if (input.nodeEnv === "production") {
      throw new Error("EMAIL_DELIVERY=dev-sink cannot be used in production.");
    }
    return "dev-sink";
  }
  if (input.resendApiKey && input.emailFrom) return "resend";
  return "unconfigured";
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function numberFrom(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
