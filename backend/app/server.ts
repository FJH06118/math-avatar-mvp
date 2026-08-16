import { serve } from "@hono/node-server";
import { createApplication } from "./app.ts";
import { loadAppConfig } from "./config.ts";
import { createProductPrismaClient } from "./database.ts";

const config = loadAppConfig();
const prisma = createProductPrismaClient(config.databaseUrl);
const app = createApplication({
  prisma,
  assetRoot: config.assetRoot,
  internalToken: config.internalToken,
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  process.stdout.write(`application service listening on http://127.0.0.1:${info.port}\n`);
});

async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
