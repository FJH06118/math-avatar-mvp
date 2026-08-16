import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client.ts";

export function createProductPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

export function createProductPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 4 });
}

export async function clearProductState(prisma: PrismaClient): Promise<void> {
  await prisma.providerProfile.deleteMany();
  await prisma.generationTaskStep.deleteMany();
  await prisma.taskOutbox.deleteMany();
  await prisma.generationTask.deleteMany();
  await prisma.presentation.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.project.deleteMany();
}
