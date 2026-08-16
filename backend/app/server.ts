import { serve } from "@hono/node-server";
import { createApplication } from "./app.ts";
import { loadAppConfig } from "./config.ts";
import { createProductPrismaClient } from "./database.ts";
import { isRuntimeShutdownMessage, sendRuntimeReady } from "./runtime-control.ts";
import { createIpcSecretClient } from "./secret-client.ts";

const config = loadAppConfig();
const prisma = createProductPrismaClient(config.databaseUrl);
await prisma.project.count();
const app = createApplication({
  prisma,
  assetRoot: config.assetRoot,
  internalToken: config.internalToken,
  secretClient: createIpcSecretClient(),
});

const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: config.port }, (info) => {
  process.stdout.write(`application service listening on http://127.0.0.1:${info.port}\n`);
  sendRuntimeReady("hono");
});

let shutdownPromise: Promise<void> | undefined;

async function shutdown(): Promise<void> {
  shutdownPromise ??= (async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.$disconnect();
  })();
  await shutdownPromise;
}

function requestShutdown(): void {
  void shutdown().then(() => process.exit(0), () => process.exit(1));
}

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);
process.on("message", (message: unknown) => {
  if (isRuntimeShutdownMessage(message)) requestShutdown();
});
