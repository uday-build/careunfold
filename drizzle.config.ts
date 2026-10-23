import { defineConfig } from "drizzle-kit";

function postgresUrl() {
  for (const value of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (!value?.startsWith("postgres")) continue;
    if (/@HOST[:/]/.test(value)) continue;
    return value;
  }
  return "postgres://careunfold:careunfold@localhost:5432/careunfold";
}

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: postgresUrl(),
  },
});
