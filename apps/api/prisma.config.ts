// Prisma 7 config (docs/tasks/04-backend-database.md §2 G2). Env is not auto-loaded in Prisma 7,
// so read the root .env here; the shell environment wins when both are set.
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env file: rely on the shell environment (CI, containers).
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"] ?? "",
  },
});
