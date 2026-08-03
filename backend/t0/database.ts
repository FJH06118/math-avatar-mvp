import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const databaseUrlName = "PPT_DH_T0_DATABASE_URL";

export function getT0DatabaseUrl(): string {
  const databaseUrl = process.env[databaseUrlName];
  if (!databaseUrl) {
    throw new Error(`${databaseUrlName} must be set for the T0 PostgreSQL POC.`);
  }
  return databaseUrl;
}

export function createT0PrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: getT0DatabaseUrl() }),
  });
}

export function createT0Pool(): Pool {
  return new Pool({
    connectionString: getT0DatabaseUrl(),
    max: 4,
  });
}

export async function clearT0State(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE "T0TaskStepAttempt", "T0TaskStep", "T0Outbox", "T0Task"',
  );
}
