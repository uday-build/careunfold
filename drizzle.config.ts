import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL?.startsWith("postgres")
      ? process.env.DATABASE_URL
      : "postgres://careunfold:careunfold@localhost:5432/careunfold",
  },
});
