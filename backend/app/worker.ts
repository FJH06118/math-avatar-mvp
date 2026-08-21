import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { loadWorkerConfig } from "./config.ts";
import { createProductPool, createProductPrismaClient } from "./database.ts";
import { dispatchPendingOutbox } from "./dispatcher.ts";
import { PythonParseAdapter } from "./parse-adapter.ts";
import { runClaimedParseStep } from "./parse-worker.ts";
import { claimNextProductStep } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { DatabaseProviderResolver, ProviderGatewayAgentAdapter } from "./agent-adapter.ts";
import { createIpcSecretClient } from "./secret-client.ts";
import { runClaimedPlanStep } from "./plan-worker.ts";
import { EdgeTtsAudioAdapter } from "./audio-adapter.ts";
import { runClaimedAudioStep } from "./audio-worker.ts";
import { SharpFfmpegPageRenderAdapter } from "./render-adapter.ts";
import { runClaimedRenderStep } from "./render-worker.ts";
import { FfmpegCompositeAdapter, FfmpegMediaValidationAdapter } from "./media-adapter.ts";
import { runClaimedCompositeStep, runClaimedValidationStep } from "./media-worker.ts";
import { isRuntimeShutdownMessage, sendRuntimeReady } from "./runtime-control.ts";
import { claimNextWorkflow, runClaimedWorkflow } from "./workflow-worker.ts";
import { WorkflowOrchestrator } from "./workflow-orchestrator.ts";

const config = loadWorkerConfig();
const prisma = createProductPrismaClient(config.databaseUrl);
const pool = createProductPool(config.databaseUrl);
const workerId = `worker_${randomUUID()}`;
const assets = new LocalAssetStore(config.assetRoot);
const adapter = new PythonParseAdapter(config.pythonCommand);
const secretClient = createIpcSecretClient();
const providerResolver = new DatabaseProviderResolver(prisma, secretClient, config.agentProvider);
const agentAdapter = new ProviderGatewayAgentAdapter(providerResolver);
const abort = new AbortController();
const audioAdapter = new EdgeTtsAudioAdapter();
const renderAdapter = new SharpFfmpegPageRenderAdapter();
const compositeAdapter = new FfmpegCompositeAdapter();
const validationAdapter = new FfmpegMediaValidationAdapter();
const workflowOrchestrator = new WorkflowOrchestrator(prisma);
const PLAN_CLAIM_ATTEMPTS = 2;
const PLAN_EXTERNAL_ATTEMPTS = 1;

process.once("SIGINT", () => abort.abort());
process.once("SIGTERM", () => abort.abort());
process.on("message", (message: unknown) => {
  if (isRuntimeShutdownMessage(message)) abort.abort();
});

try {
  await dispatchPendingOutbox(prisma);
  sendRuntimeReady("worker");
  while (!abort.signal.aborted) {
    await dispatchPendingOutbox(prisma);
    const claim =
      (await claimNextProductStep(pool, workerId, 30_000)) ??
      (await claimNextProductStep(pool, workerId, 30_000, PLAN_CLAIM_ATTEMPTS, "PLAN")) ??
      (await claimNextProductStep(pool, workerId, 30_000, 3, "AUDIO")) ??
      (await claimNextProductStep(pool, workerId, 60_000, 3, "PAGE_RENDER")) ??
      (await claimNextProductStep(pool, workerId, 60_000, 3, "COMPOSITE")) ??
      (await claimNextProductStep(pool, workerId, 60_000, 3, "VALIDATE"));
    if (!claim) {
      const workflowClaim = await claimNextWorkflow(pool, workerId, 30_000);
      if (workflowClaim) {
        await runClaimedWorkflow(
          { prisma, orchestrator: workflowOrchestrator },
          workflowClaim,
          workerId,
        );
        continue;
      }
      await delay(500, undefined, { signal: abort.signal }).catch(() => undefined);
      continue;
    }
    const step = await prisma.generationTaskStep.findUniqueOrThrow({ where: { id: claim.taskStepId } });
    if (step.stage === "PARSE") {
      await runClaimedParseStep(
        { prisma, pool, assets, adapter, attemptRoot: config.attemptRoot, leaseMs: 30_000 },
        claim,
        workerId,
      );
    } else if (step.stage === "PLAN") {
      await runClaimedPlanStep({
        prisma,
        pool,
        assets,
        adapter: agentAdapter,
        leaseMs: 30_000,
        maxAttempts: PLAN_EXTERNAL_ATTEMPTS,
        maxExternalAttempts: PLAN_EXTERNAL_ATTEMPTS,
      }, claim, workerId);
    } else if (step.stage === "AUDIO") {
      await runClaimedAudioStep(
        { prisma, pool, assets, adapter: audioAdapter, attemptRoot: config.attemptRoot, leaseMs: 30_000 },
        claim,
        workerId,
      );
    } else if (step.stage === "PAGE_RENDER") {
      await runClaimedRenderStep(
        { prisma, pool, assets, adapter: renderAdapter, attemptRoot: config.attemptRoot, leaseMs: 60_000 },
        claim,
        workerId,
      );
    } else if (step.stage === "COMPOSITE") {
      await runClaimedCompositeStep(
        { prisma, pool, assets, adapter: compositeAdapter, attemptRoot: config.attemptRoot, leaseMs: 60_000 }, claim, workerId,
      );
    } else {
      await runClaimedValidationStep(
        { prisma, pool, assets, adapter: validationAdapter, attemptRoot: config.attemptRoot, leaseMs: 60_000 }, claim, workerId,
      );
    }
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
