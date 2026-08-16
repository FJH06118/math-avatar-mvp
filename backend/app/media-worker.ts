import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";
import type { Pool } from "pg";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { CompositeAdapter, MediaValidationAdapter } from "./media-adapter.ts";
import { stableId } from "./lesson-plan-builder.ts";
import { failProductStep, heartbeatProductLease, type ProductClaim } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { WorkerError } from "./worker-error.ts";

const PayloadSchema = z.object({
  renderTaskId: z.string().min(1), audioTaskId: z.string().min(1), fps: z.union([z.literal(25), z.literal(30)]),
  totalDurationMs: z.number().int().min(1), captions: z.object({ assetId: z.string().min(1), sha256: z.string().length(64) }).strict(),
  pages: z.array(z.object({ pageOrder: z.number().int().min(1), durationMs: z.number().int().min(1_500), videoAssetId: z.string().min(1), videoSha256: z.string().length(64), frameAssetId: z.string().min(1), frameSha256: z.string().length(64) }).strict()).min(1),
}).strict();

export async function runClaimedCompositeStep(
  dependencies: { prisma: PrismaClient; pool: Pool; assets: LocalAssetStore; adapter: CompositeAdapter; attemptRoot: string; leaseMs: number; maxAttempts?: number },
  claim: ProductClaim, workerId: string,
): Promise<"SUCCEEDED" | "QUEUED" | "FAILED" | "CANCELLED"> {
  const task = await dependencies.prisma.generationTask.findUniqueOrThrow({ where: { id: claim.taskId }, include: { outbox: { where: { eventType: "COMPOSITE_REQUESTED" }, take: 1 } } });
  if (task.kind !== "VALIDATE" || task.stage !== "COMPOSITE") return failProductStep(dependencies.pool, claim, workerId, "UNSUPPORTED_TASK", "Worker 收到了不支持的合成任务。", false, dependencies.maxAttempts);
  const payload = PayloadSchema.safeParse(task.outbox[0]?.payload);
  if (!payload.success) return failProductStep(dependencies.pool, claim, workerId, "COMPOSITE_SNAPSHOT_INVALID", "最终合成快照无效。", false, dependencies.maxAttempts);
  const ids = [payload.data.captions.assetId, ...payload.data.pages.flatMap((page) => [page.videoAssetId, page.frameAssetId])];
  const records = await dependencies.prisma.asset.findMany({ where: { id: { in: ids }, projectId: task.projectId, lifecycle: "AVAILABLE" } });
  const byId = new Map(records.map((asset) => [asset.id, asset]));
  const mismatch = byId.get(payload.data.captions.assetId)?.sha256 !== payload.data.captions.sha256 || payload.data.pages.some((page) => byId.get(page.videoAssetId)?.sha256 !== page.videoSha256 || byId.get(page.frameAssetId)?.sha256 !== page.frameSha256);
  if (mismatch) return failProductStep(dependencies.pool, claim, workerId, "COMPOSITE_ASSET_MISMATCH", "合成资产缺失或哈希不一致。", false, dependencies.maxAttempts);
  const controller = leaseController(dependencies.pool, claim, workerId, dependencies.leaseMs);
  try {
    const result = await dependencies.adapter.run({
      pageVideoPaths: payload.data.pages.map((page) => dependencies.assets.resolveForRead(byId.get(page.videoAssetId)!.storageKey)),
      captionsPath: dependencies.assets.resolveForRead(byId.get(payload.data.captions.assetId)!.storageKey),
      fps: payload.data.fps, expectedDurationMs: payload.data.totalDurationMs,
      attemptDir: safeAttemptDir(dependencies.attemptRoot, task.id, claim.taskStepId, claim.attempt), signal: controller.signal,
    });
    if (controller.signal.aborted) return cancellationState(dependencies.prisma, task.id);
    const sha256 = createHash("sha256").update(result.bytes).digest("hex");
    const storageKey = await dependencies.assets.putFinalVideo(task.projectId, sha256, result.bytes);
    const now = new Date();
    await dependencies.prisma.$transaction(async (transaction) => {
      const owned = await transaction.generationTaskStep.updateMany({ where: { id: claim.taskStepId, workerId, currentAttempt: claim.attempt, status: "RUNNING" }, data: { status: "SUCCEEDED", progressCompleted: 1, progressTotal: 1, workerId: null, leaseExpiresAt: null, completedAt: now, outputHash: sha256 } });
      if (owned.count !== 1) throw new WorkerError("LEASE_LOST", "Worker 已失去合成步骤租约。", true);
      const candidateId = stableId("asset", `${task.projectId}:VIDEO_CANDIDATE:${sha256}`);
      await transaction.asset.upsert({ where: { projectId_kind_sha256: { projectId: task.projectId, kind: "VIDEO_CANDIDATE", sha256 } }, update: {}, create: { id: candidateId, projectId: task.projectId, taskId: task.id, kind: "VIDEO_CANDIDATE", storageKey, sha256, mimeType: "video/mp4", fileSize: result.bytes.byteLength } });
      const candidate = await transaction.asset.findUniqueOrThrow({ where: { projectId_kind_sha256: { projectId: task.projectId, kind: "VIDEO_CANDIDATE", sha256 } } });
      await transaction.mediaOutput.create({ data: { id: stableId("media_output", task.id), taskId: task.id, renderTaskId: payload.data.renderTaskId, audioTaskId: payload.data.audioTaskId, videoAssetId: candidate.id, captionsAssetId: payload.data.captions.assetId, totalDurationMs: payload.data.totalDurationMs, fps: payload.data.fps, status: "CANDIDATE", inputHash: task.inputHash } });
      const validateStepId = stableId("step", `${task.id}:VALIDATE:task`);
      await transaction.generationTaskStep.create({ data: { id: validateStepId, taskId: task.id, stage: "VALIDATE", status: "QUEUED", inputHash: sha256 } });
      await transaction.taskStepAttempt.update({ where: { taskStepId_attempt: { taskStepId: claim.taskStepId, attempt: claim.attempt } }, data: { status: "SUCCEEDED", completedAt: now } });
      await transaction.generationTask.update({ where: { id: task.id }, data: { stage: "VALIDATE", status: "QUEUED", progressCompleted: 1, heartbeatAt: now, statusVersion: { increment: 1 }, errorCode: null, errorMessage: null } });
    });
    return "SUCCEEDED";
  } catch (error) { return handleFailure(dependencies, claim, workerId, task.id, error); }
  finally { controller.stop(); }
}

export async function runClaimedValidationStep(
  dependencies: { prisma: PrismaClient; pool: Pool; assets: LocalAssetStore; adapter: MediaValidationAdapter; attemptRoot: string; leaseMs: number; maxAttempts?: number },
  claim: ProductClaim, workerId: string,
): Promise<"SUCCEEDED" | "QUEUED" | "FAILED" | "CANCELLED"> {
  const task = await dependencies.prisma.generationTask.findUniqueOrThrow({ where: { id: claim.taskId }, include: { mediaOutput: { include: { videoAsset: true } }, presentation: true } });
  if (task.kind !== "VALIDATE" || task.stage !== "VALIDATE" || !task.mediaOutput) return failProductStep(dependencies.pool, claim, workerId, "UNSUPPORTED_TASK", "Worker 收到了不支持的验证任务。", false, dependencies.maxAttempts);
  const renderTask = await dependencies.prisma.generationTask.findUniqueOrThrow({ where: { id: task.mediaOutput.renderTaskId }, include: { renderedPages: { orderBy: { pageOrder: "asc" }, include: { frameAsset: true } } } });
  const controller = leaseController(dependencies.pool, claim, workerId, dependencies.leaseMs);
  try {
    const candidateValid = await verifyStoredAsset(dependencies.assets, task.mediaOutput.videoAsset);
    const framesValid = (await Promise.all(renderTask.renderedPages.map((page) => verifyStoredAsset(dependencies.assets, page.frameAsset)))).every(Boolean);
    if (!candidateValid || !framesValid) {
      await dependencies.prisma.$transaction([
        dependencies.prisma.mediaOutput.update({ where: { id: task.mediaOutput.id }, data: { status: "REJECTED" } }),
        dependencies.prisma.asset.update({ where: { id: task.mediaOutput.videoAssetId }, data: { lifecycle: "INVALID" } }),
      ]);
      return failProductStep(dependencies.pool, claim, workerId, "MEDIA_ASSET_INTEGRITY_FAILED", "Media validation input failed size or SHA-256 verification.", false, dependencies.maxAttempts);
    }
    const report = await dependencies.adapter.run({
      videoPath: dependencies.assets.resolveForRead(task.mediaOutput.videoAsset.storageKey), fps: task.mediaOutput.fps as 25 | 30,
      expectedDurationMs: task.mediaOutput.totalDurationMs, expectedPageCount: task.presentation.slideCount,
      pages: renderTask.renderedPages.map((page) => ({ pageOrder: page.pageOrder, durationMs: page.durationMs, framePath: dependencies.assets.resolveForRead(page.frameAsset.storageKey), avatarPlacement: page.avatarPlacement, overlayType: page.overlayType })),
      attemptDir: safeAttemptDir(dependencies.attemptRoot, task.id, claim.taskStepId, claim.attempt), signal: controller.signal,
    });
    if (controller.signal.aborted) return cancellationState(dependencies.prisma, task.id);
    const now = new Date();
    await dependencies.prisma.mediaValidationRecord.upsert({ where: { outputId: task.mediaOutput.id }, update: { status: report.status, report: report as unknown as Prisma.InputJsonValue }, create: { id: stableId("media_validation", task.id), outputId: task.mediaOutput.id, status: report.status, report: report as unknown as Prisma.InputJsonValue } });
    if (report.status !== "passed") {
      await dependencies.prisma.mediaOutput.update({ where: { id: task.mediaOutput.id }, data: { status: "REJECTED" } });
      await dependencies.prisma.asset.update({ where: { id: task.mediaOutput.videoAssetId }, data: { lifecycle: "INVALID" } });
      return failProductStep(dependencies.pool, claim, workerId, "MEDIA_VALIDATION_FAILED", `媒体硬门失败：${report.errors.join(",")}`, false, dependencies.maxAttempts);
    }
    await dependencies.prisma.$transaction(async (transaction) => {
      const owned = await transaction.generationTaskStep.updateMany({ where: { id: claim.taskStepId, workerId, currentAttempt: claim.attempt, status: "RUNNING" }, data: { status: "SUCCEEDED", progressCompleted: 1, progressTotal: 1, workerId: null, leaseExpiresAt: null, completedAt: now, outputHash: task.mediaOutput!.videoAsset.sha256 } });
      if (owned.count !== 1) throw new WorkerError("LEASE_LOST", "Worker 已失去验证步骤租约。", true);
      await transaction.mediaOutput.update({ where: { id: task.mediaOutput!.id }, data: { status: "VALIDATED" } });
      await transaction.taskStepAttempt.update({ where: { taskStepId_attempt: { taskStepId: claim.taskStepId, attempt: claim.attempt } }, data: { status: "SUCCEEDED", completedAt: now } });
      await transaction.generationTask.update({ where: { id: task.id }, data: { status: "SUCCEEDED", progressCompleted: 2, completedAt: now, heartbeatAt: now, statusVersion: { increment: 1 }, errorCode: null, errorMessage: null } });
    });
    return "SUCCEEDED";
  } catch (error) { return handleFailure(dependencies, claim, workerId, task.id, error); }
  finally { controller.stop(); }
}

function leaseController(pool: Pool, claim: ProductClaim, workerId: string, leaseMs: number) {
  const controller = new AbortController(); let running = false;
  const timer = setInterval(() => { if (running || controller.signal.aborted) return; running = true; void heartbeatProductLease(pool, claim, workerId, leaseMs).then((owned) => { if (!owned) controller.abort(); }).catch(() => controller.abort()).finally(() => { running = false; }); }, Math.max(100, Math.floor(leaseMs / 3)));
  return { signal: controller.signal, stop: () => { clearInterval(timer); controller.abort(); } };
}
async function handleFailure(dependencies: { prisma: PrismaClient; pool: Pool; maxAttempts?: number }, claim: ProductClaim, workerId: string, taskId: string, error: unknown) {
  const current = await dependencies.prisma.generationTask.findUnique({ where: { id: taskId } });
  if (current?.status === "CANCELLED") return "CANCELLED" as const;
  const publicError = error instanceof WorkerError ? error : new WorkerError("MEDIA_WORKER_FAILED", "媒体 Worker 执行失败。", true);
  return failProductStep(dependencies.pool, claim, workerId, publicError.code, publicError.message, publicError.retryable, dependencies.maxAttempts);
}
async function cancellationState(prisma: PrismaClient, taskId: string) { return (await prisma.generationTask.findUniqueOrThrow({ where: { id: taskId } })).status === "CANCELLED" ? "CANCELLED" as const : "QUEUED" as const; }
function safeAttemptDir(root: string, taskId: string, stepId: string, attempt: number) { const resolvedRoot = resolve(root); const target = resolve(resolvedRoot, taskId, stepId, `attempt-${attempt}`); if (!target.startsWith(`${resolvedRoot}${sep}`)) throw new Error("Attempt path escaped the configured root."); return target; }
async function verifyStoredAsset(store: LocalAssetStore, asset: { storageKey: string; sha256: string; fileSize: bigint | number }): Promise<boolean> {
  try {
    const bytes = await readFile(store.resolveForRead(asset.storageKey));
    return BigInt(bytes.byteLength) === BigInt(asset.fileSize) && createHash("sha256").update(bytes).digest("hex") === asset.sha256;
  } catch {
    return false;
  }
}
