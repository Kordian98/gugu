import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./schema.prisma",
  migrations: { path: "./migrations" },
  datasource: {
    url: process.env["SPIKE_DATABASE_URL"] ?? "",
    shadowDatabaseUrl: process.env["SPIKE_SHADOW_DATABASE_URL"] ?? "",
  },
});
