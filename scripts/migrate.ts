import path from "node:path";
import { applyMigrations } from "../src/server/db/client";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is missing. Copy .env.example to .env.local first.");
    process.exit(1);
  }
  const opened = await applyMigrations(databaseUrl, path.join(process.cwd(), "drizzle"));
  await opened.close();
  console.log("Migrations applied.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Migration failed.";
  const cause = error instanceof Error && error.cause instanceof Error ? ` ${error.cause.message}` : "";
  console.error(`${message}${cause}`);
  process.exit(1);
});
