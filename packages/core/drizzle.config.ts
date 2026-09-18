import { join } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit s'exécute depuis packages/core (scripts pnpm) : le .env est à la racine du monorepo.
config({ path: join(process.cwd(), "..", "..", ".env"), quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://jobhunt@localhost:5432/jobhunt",
  },
  strict: true,
  verbose: true,
});
