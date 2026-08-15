import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { Pool } from "pg";
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { ParseAdapter } from "./parse-adapter.ts";
import { ParseResultPersister } from "./parse-persister.ts";
import {
  failProductStep,
  heartbeatProductLease,
  type ProductClaim,
} from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { toWorkerError, WorkerError } from "./worker-error.ts";

export interface ParseWorkerDependencies {
  prisma: PrismaClient;
  pool: Pool;
  assets: LocalAssetStore;
  adapter: ParseAdapter;
  attemptRoot: string;
  leaseMs: number;
  maxAttempts?: number;
}

export async function runClaimedParseStep(
  dependencies: ParseWorkerDependencies,
  claim: ProductClaim,
  workerId: string,
): Promise<"SUCCEEDED" | "QUEUED" | "FAILED" | "CANCELLED"> {
  const task = await dependencies.prisma.generationTask.findUniqueOrThrow({
    where: { id: claim.taskId },
    include: { presentation: { include: { sourceAsset: true } } },
  });
  if (task.kind !== "PARSE" || task.stage !== "PARSE") {
    return failProductStep(
      dependencies.pool,
      claim,
      workerId,
      "UNSUPPORTED_TASK",
      "Worker 收到了不支持的任务类型。",
      false,
      dependencies.maxAttempts,
    );
  }

  const controller = new AbortController();
  let heartbeatRunning = false;
  const heartbeat = async () => {
    if (heartbeatRunning || controller.signal.aborted) {
      return;
    }
    heartbeatRunning = true;
    try {
      const owned = await heartbeatProductLease(
        dependencies.pool,
        claim,
        workerId,
        dependencies.leaseMs,
      );
      if (!owned) {
        controller.abort();
      }
    } catch {
      controller.abort();
    } finally {
      heartbeatRunning = false;
    }
  };
  const timer = setInterval(() => void heartbeat(), Math.max(50, Math.floor(dependencies.leaseMs / 3)));
  const attemptDir = safeAttemptDir(
    dependencies.attemptRoot,
    claim.taskId,
    claim.taskStepId,
    claim.attempt,
  );
  try {
    await verifyAssetOnDisk(dependencies.assets, task.presentation.sourceAsset);
    const result = await dependencies.adapter.run({
      sourcePath: dependencies.assets.resolveForRead(task.presentation.sourceAsset.storageKey),
      attemptDir,
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      const current = await dependencies.prisma.generationTask.findUniqueOrThrow({
        where: { id: claim.taskId },
      });
      return current.status === "CANCELLED" ? "CANCELLED" : "QUEUED";
    }
    await new ParseResultPersister(dependencies.prisma, dependencies.assets).persist(
      claim,
      workerId,
      result,
    );
    return "SUCCEEDED";
  } catch (error) {
    const current = await dependencies.prisma.generationTask.findUnique({ where: { id: claim.taskId } });
    if (current?.status === "CANCELLED") {
      return "CANCELLED";
    }
    const publicError = toWorkerError(error);
    return failProductStep(
      dependencies.pool,
      claim,
      workerId,
      publicError.code,
      publicError.message,
      publicError.retryable,
      dependencies.maxAttempts,
    );
  } finally {
    clearInterval(timer);
    controller.abort();
  }
}

async function verifyAssetOnDisk(
  assets: LocalAssetStore,
  asset: { storageKey: string; fileSize: number; sha256: string },
): Promise<void> {
  const bytes = await readFile(assets.resolveForRead(asset.storageKey));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== asset.fileSize || sha256 !== asset.sha256) {
    throw new WorkerError("SOURCE_ASSET_INTEGRITY_FAILED", "源课件在解析前完整性校验失败。", false);
  }
}

function safeAttemptDir(root: string, taskId: string, stepId: string, attempt: number): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, taskId, stepId, `attempt-${attempt}`);
  if (!target.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error("Attempt path escaped the configured root.");
  }
  return target;
}
