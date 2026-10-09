import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { schema } from "./schema";

export function createPostgresDatabase(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzlePostgres(client, { schema });
  return { db, close: () => client.end() };
}

export function createPgliteDatabase(url: string) {
  const rawLocation = url === "pglite:memory" ? undefined : url.slice("pglite:".length);
  const location = rawLocation ? path.resolve(rawLocation) : undefined;
  if (location) mkdirSync(path.dirname(location), { recursive: true });
  const client = new PGlite(location);
  const db = drizzlePglite(client, { schema });
  return { db, close: () => client.close() };
}

export type AppDatabase = ReturnType<typeof createPostgresDatabase>["db"];

export function createDatabase(url: string): { db: AppDatabase; close: () => Promise<void> } {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return createPostgresDatabase(url);
  }
  if (url.startsWith("pglite:")) {
    const opened = createPgliteDatabase(url);
    return { db: opened.db as unknown as AppDatabase, close: opened.close };
  }
  throw new Error("DATABASE_URL must start with postgres://, postgresql://, or pglite:");
}

export async function applyMigrations(url: string, migrationsFolder: string) {
  if (url.startsWith("pglite:")) {
    const opened = createPgliteDatabase(url);
    await migratePglite(opened.db, { migrationsFolder });
    return { db: opened.db as unknown as AppDatabase, close: opened.close };
  }
  const opened = createPostgresDatabase(url);
  await migratePostgres(opened.db, { migrationsFolder });
  return opened;
}
