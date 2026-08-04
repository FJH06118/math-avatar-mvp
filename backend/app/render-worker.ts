import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";
import { OverlaySchema } from "@ppt-digital-human/contracts";
import type { Pool } from "pg";
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { PageRenderAdapter } from "./render-adapter.ts";
import { stableId } from "./lesson-plan-builder.ts";
import { failProductStep, heartbeatProductLease, type ProductClaim } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { WorkerError } from "./worker-error.ts";

const PageSchema = z.object({
  slideId: z.string().min(1), revisionId: z.string().min(1), pageOrder: z.number().int().min(1),
  durationMs: z.number().int().min(1_500), sourceAssetId: z.string().min(1), sourceSha256: z.string().length(64),
  audio: z.array(z.object({ assetId: z.string().min(1), sha256: z.string().length(64), durationMs: z.number().int().min(200) }).strict()).min(1),
  overlay: OverlaySchema.optional(), inputHash: z.string().length(64),
  avatarPlacement: z.enum(["right-panel", "hidden"]),
}).strict();
const PayloadSchema = z.object({ fps: z.union([z.literal(25), z.literal(30)]), audioTaskId: z.string().min(1), pages: z.array(PageSchema).min(1) }).strict();

export async function runClaimedRenderStep(
  dependencies: { prisma: PrismaClient; pool: Pool; assets: LocalAssetStore; adapter: PageRenderAdapter; attemptRoot: string; leaseMs: number; maxAttempts?: number },
  claim: ProductClaim,
  workerId: string,
): Promise<"SUCCEEDED" | "QUEUED" | "FAILED" | "CANCELLED"> {
  const task = await dependencies.prisma.generationTask.findUniqueOrThrow({
    where: { id: claim.taskId },
    include: { outbox: { where: { eventType: "RENDER_REQUESTED" }, take: 1 }, renderedPages: true },
  });
  if (task.kind !== "GENERATE" || task.stage !== "PAGE_RENDER") return failProductStep(dependencies.pool, claim, workerId, "UNSUPPORTED_TASK", "Worker 收到了不支持的渲染任务。", false, dependencies.maxAttempts);
  const payload = PayloadSchema.safeParse(task.outbox[0]?.payload);
  const step = await dependencies.prisma.generationTaskStep.findUniqueOrThrow({ where: { id: claim.taskStepId } });
  const page = payload.success ? payload.data.pages.find((item) => item.inputHash === step.inputHash) : undefined;
  if (!payload.success || !page) return failProductStep(dependencies.pool, claim, workerId, "RENDER_SNAPSHOT_INVALID", "分页渲染快照无效。", false, dependencies.maxAttempts);
  const requestedIds = [page.sourceAssetId, ...page.audio.map((item) => item.assetId)];
  const assets = await dependencies.prisma.asset.findMany({ where: { id: { in: requestedIds }, projectId: task.projectId, lifecycle: "AVAILABLE" } });
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const source = byId.get(page.sourceAssetId);
  if (!source || source.sha256 !== page.sourceSha256 || page.audio.some((item) => byId.get(item.assetId)?.sha256 !== item.sha256)) {
    return failProductStep(dependencies.pool, claim, workerId, "RENDER_ASSET_MISMATCH", "渲染资产缺失或哈希不一致。", false, dependencies.maxAttempts);
  }
  const controller = new AbortController();
  let heartbeatRunning = false;
  const timer = setInterval(() => {
    if (heartbeatRunning || controller.signal.aborted) return;
    heartbeatRunning = true;
    void heartbeatProductLease(dependencies.pool, claim, workerId, dependencies.leaseMs)
      .then((owned) => { if (!owned) controller.abort(); }).catch(() => controller.abort()).finally(() => { heartbeatRunning = false; });
  }, Math.max(100, Math.floor(dependencies.leaseMs / 3)));
  try {
    const cached = await dependencies.prisma.renderedPage.findFirst({
      where: {
        inputHash: page.inputHash,
        task: { projectId: task.projectId },
        frameAsset: { lifecycle: "AVAILABLE" },
        videoAsset: { lifecycle: "AVAILABLE" },
      },
      include: { frameAsset: true, videoAsset: true },
      orderBy: { createdAt: "desc" },
    });
    let result;
    if (cached) {
      const frameBytes = await readVerifiedAsset(dependencies.assets, cached.frameAsset);
      const videoBytes = await readVerifiedAsset(dependencies.assets, cached.videoAsset);
      result = {
        frameBytes,
        videoBytes,
        avatarPlacement: cached.avatarPlacement as "right-panel" | "hidden",
        overlayType: cached.overlayType as "highlightBox" | "arrow" | undefined,
      };
    } else result = await dependencies.adapter.run({
      sourcePath: dependencies.assets.resolveForRead(source.storageKey),
      audioPaths: page.audio.map((item) => dependencies.assets.resolveForRead(byId.get(item.assetId)!.storageKey)),
      durationMs: page.durationMs, fps: payload.data.fps, pageOrder: page.pageOrder, pageCount: payload.data.pages.length,
      overlay: page.overlay, avatarPlacement: page.avatarPlacement,
      attemptDir: safeAttemptDir(dependencies.attemptRoot, task.id, step.id, claim.attempt), signal: controller.signal,
    });
    if (controller.signal.aborted) {
      const current = await dependencies.prisma.generationTask.findUniqueOrThrow({ where: { id: task.id } });
      return current.status === "CANCELLED" ? "CANCELLED" : "QUEUED";
    }
    const frameSha = createHash("sha256").update(result.frameBytes).digest("hex");
    const videoSha = createHash("sha256").update(result.videoBytes).digest("hex");
    const frameKey = await dependencies.assets.putPageFrame(task.projectId, frameSha, result.frameBytes);
    const videoKey = await dependencies.assets.putPageVideo(task.projectId, videoSha, result.videoBytes);
    const currentPage = {
      id: stableId("rendered_page", `${task.id}:${page.slideId}`), taskId: task.id, slideId: page.slideId,
      revisionId: page.revisionId, pageOrder: page.pageOrder, durationMs: page.durationMs, fps: payload.data.fps,
      width: 1920, height: 1080, frameSha256: frameSha, videoSha256: videoSha,
      avatarPlacement: result.avatarPlacement, overlayType: result.overlayType ?? null, inputHash: page.inputHash,
    };
    const completedCount = task.renderedPages.length + 1;
    const isFinal = completedCount === payload.data.pages.length;
    const now = new Date();
    await dependencies.prisma.$transaction(async (transaction) => {
      const owned = await transaction.generationTaskStep.updateMany({ where: { id: step.id, workerId, currentAttempt: claim.attempt, status: "RUNNING" }, data: {
        status: "SUCCEEDED", progressCompleted: 1, progressTotal: 1, workerId: null, leaseExpiresAt: null,
        completedAt: now, outputHash: videoSha, errorCode: null, errorMessage: null,
      } });
      if (owned.count !== 1) throw new WorkerError("LEASE_LOST", "Worker 已失去分页渲染租约。", true);
      const frameId = stableId("asset", `${task.projectId}:PAGE_FRAME:${frameSha}`);
      const videoId = stableId("asset", `${task.projectId}:PAGE_VIDEO:${videoSha}`);
      await transaction.asset.upsert({ where: { projectId_kind_sha256: { projectId: task.projectId, kind: "PAGE_FRAME", sha256: frameSha } }, update: {}, create: {
        id: frameId, projectId: task.projectId, taskId: task.id, kind: "PAGE_FRAME", storageKey: frameKey, sha256: frameSha, mimeType: "image/png", fileSize: result.frameBytes.byteLength,
      } });
      await transaction.asset.upsert({ where: { projectId_kind_sha256: { projectId: task.projectId, kind: "PAGE_VIDEO", sha256: videoSha } }, update: {}, create: {
        id: videoId, projectId: task.projectId, taskId: task.id, kind: "PAGE_VIDEO", storageKey: videoKey, sha256: videoSha, mimeType: "video/mp4", fileSize: result.videoBytes.byteLength,
      } });
      const frame = await transaction.asset.findUniqueOrThrow({ where: { projectId_kind_sha256: { projectId: task.projectId, kind: "PAGE_FRAME", sha256: frameSha } } });
      const video = await transaction.asset.findUniqueOrThrow({ where: { projectId_kind_sha256: { projectId: task.projectId, kind: "PAGE_VIDEO", sha256: videoSha } } });
      await transaction.renderedPage.create({ data: { ...currentPage, frameAssetId: frame.id, videoAssetId: video.id } });
      await transaction.taskStepAttempt.update({ where: { taskStepId_attempt: { taskStepId: step.id, attempt: claim.attempt } }, data: { status: "SUCCEEDED", completedAt: now } });
      await transaction.generationTask.update({ where: { id: task.id }, data: {
        status: isFinal ? "SUCCEEDED" : "RUNNING", progressCompleted: completedCount, completedAt: isFinal ? now : null,
        heartbeatAt: now, statusVersion: { increment: 1 }, errorCode: null, errorMessage: null,
      } });
    });
    return "SUCCEEDED";
  } catch (error) {
    const current = await dependencies.prisma.generationTask.findUnique({ where: { id: task.id } });
    if (current?.status === "CANCELLED") return "CANCELLED";
    const publicError = error instanceof WorkerError ? error : new WorkerError("RENDER_WORKER_FAILED", "分页渲染 Worker 执行失败。", true);
    return failProductStep(dependencies.pool, claim, workerId, publicError.code, publicError.message, publicError.retryable, dependencies.maxAttempts);
  } finally { clearInterval(timer); controller.abort(); }
}

async function readVerifiedAsset(
  assets: LocalAssetStore,
  asset: { storageKey: string; fileSize: number; sha256: string },
): Promise<Uint8Array> {
  const bytes = await readFile(assets.resolveForRead(asset.storageKey));
  const actualSha = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== asset.fileSize || actualSha !== asset.sha256) {
    throw new WorkerError("RENDER_CACHE_INVALID", "分页渲染缓存完整性检查失败。", false);
  }
  return bytes;
}

function safeAttemptDir(root: string, taskId: string, stepId: string, attempt: number): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, taskId, stepId, `attempt-${attempt}`);
  if (!target.startsWith(`${resolvedRoot}${sep}`)) throw new Error("Attempt path escaped the configured root.");
  return target;
}
