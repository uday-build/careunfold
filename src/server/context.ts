import path from "node:path";
import { createAuth, type Auth } from "./auth/create-auth";
import { createDatabase, type AppDatabase } from "./db/client";
import { createEmailSender, type EmailSender } from "./email/delivery";
import { readEnv, type AppEnv } from "./env";
import type { AppContext } from "./domain/service";

type Runtime = {
  db: AppDatabase;
  auth: Auth;
  email: EmailSender;
  env: AppEnv;
  close: () => Promise<void>;
};

const globalForRuntime = globalThis as unknown as { careunfold?: Runtime };

export function getContext(): AppContext {
  const runtime = getRuntime();
  return {
    db: runtime.db,
    auth: runtime.auth,
    email: runtime.email,
    env: runtime.env,
    now: () => new Date(),
  };
}

function getRuntime(): Runtime {
  if (globalForRuntime.careunfold) return globalForRuntime.careunfold;
  const env = readEnv();
  const opened = createDatabase(env.databaseUrl);
  const email = createEmailSender({
    mode: env.emailDelivery,
    db: opened.db,
    resendApiKey: env.resendApiKey,
    emailFrom: env.emailFrom,
    now: () => new Date(),
  });
  const auth = createAuth({ db: opened.db, env, email });
  globalForRuntime.careunfold = { db: opened.db, auth, email, env, close: opened.close };
  return globalForRuntime.careunfold;
}

export function migrationsFolder() {
  return path.join(process.cwd(), "drizzle");
}
