import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("PPT_DH_T0_DATABASE_URL"),
    shadowDatabaseUrl: env("PPT_DH_T0_SHADOW_DATABASE_URL"),
  },
});
