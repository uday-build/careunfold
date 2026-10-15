import { sql } from "drizzle-orm";
import { createDatabase } from "../src/server/db/client";
import { readEnv } from "../src/server/env";

async function main() {
  const env = readEnv();
  const opened = createDatabase(env.databaseUrl);
  try {
    await opened.db.execute(sql`select 1 as ok`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Database check failed.");
    process.exit(1);
  } finally {
    await opened.close();
  }
  console.log(
    JSON.stringify(
      {
        database: env.databaseUrl.startsWith("pglite:") ? "pglite" : "postgres",
        authUrl: env.authUrl,
        googleSignIn: env.googleEnabled,
        emailDelivery: env.emailDelivery,
        googleRedirectPath: "/api/auth/callback/google",
        adminConfigured: Boolean(env.adminEmail),
      },
      null,
      2,
    ),
  );
  if (!env.adminEmail) {
    console.log("ADMIN_EMAIL is not set. New accounts will wait for approval, and no administrator can approve them until that address is set.");
  }
  if (!env.googleEnabled) {
    console.log("Google sign-in is not configured. The sign-in page will not start a Google session.");
  }
  if (env.emailDelivery === "unconfigured") {
    console.log("Email delivery is not configured. Verification and reset messages will not be sent.");
  }
  if (env.emailDelivery === "dev-sink") {
    console.log("Email delivery is the local outbox at /dev/outbox. Messages are not sent to an inbox.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Doctor failed.");
  process.exit(1);
});
