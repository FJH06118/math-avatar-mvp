import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

export function createProductPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

export async function clearProductState(prisma: PrismaClient): Promise<void> {
  await prisma.generationTaskStep.deleteMany();
  await prisma.taskOutbox.deleteMany();
  await prisma.generationTask.deleteMany();
  await prisma.presentation.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.project.deleteMany();
}
