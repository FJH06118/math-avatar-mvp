import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { z } from "zod";
import type { Pool } from "pg";
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { AudioAdapter } from "./audio-adapter.ts";
import { stableId } from "./lesson-plan-builder.ts";
import { failProductStep, heartbeatProductLease, type ProductClaim } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { WorkerError } from "./worker-error.ts";

const SegmentSchema = z.object({
  revisionId: z.string().min(1), slideId: z.string().min(1), narrationId: z.string().min(1),
  slideOrder: z.number().int().min(1), segmentOrder: z.number().int().min(0),
  displayText: z.string().min(1), spokenText: z.string().min(1), inputHash: z.string().length(64),
}).strict();
const PayloadSchema = z.object({
  voice: z.string().min(1), rate: z.string().min(1), pitch: z.string().min(1),
  revisions: z.array(z.string().min(1)).min(1), segments: z.array(SegmentSchema).min(1),
}).strict();

export async function runClaimedAudioStep(
  dependencies: {
    prisma: PrismaClient;
    pool: Pool;
    assets: LocalAssetStore;
    adapter: AudioAdapter;
    attemptRoot: string;
    leaseMs: number;
    maxAttempts?: number;
  },
  claim: ProductClaim,
  workerId: string,
): Promise<"SUCCEEDED" | "QUEUED" | "FAILED" | "CANCELLED"> {
  const task = await dependencies.prisma.generationTask.findUniqueOrThrow({
    where: { id: claim.taskId },
    include: { outbox: { where: { eventType: "AUDIO_REQUESTED" }, take: 1 }, audioSegments: true },
  });
  if (task.kind !== "AUDIO" || task.stage !== "AUDIO") {
    return failProductStep(dependencies.pool, claim, workerId, "UNSUPPORTED_TASK", "Worker 收到了不支持的任务类型。", false, dependencies.maxAttempts);
  }
  const payload = PayloadSchema.safeParse(task.outbox[0]?.payload);
  const step = await dependencies.prisma.generationTaskStep.findUniqueOrThrow({ where: { id: claim.taskStepId } });
  const segment = payload.success ? payload.data.segments.find((item) => item.inputHash === step.inputHash) : undefined;
  if (!payload.success || !segment) {
    return failProductStep(dependencies.pool, claim, workerId, "AUDIO_SNAPSHOT_INVALID", "音频任务快照无效。", false, dependencies.maxAttempts);
  }
  const controller = new AbortController();
  let heartbeatRunning = false;
  const timer = setInterval(() => {
    if (heartbeatRunning || controller.signal.aborted) return;
    heartbeatRunning = true;
    void heartbeatProductLease(dependencies.pool, claim, workerId, dependencies.leaseMs)
      .then((owned) => { if (!owned) controller.abort(); })
      .catch(() => controller.abort())
      .finally(() => { heartbeatRunning = false; });
  }, Math.max(50, Math.floor(dependencies.leaseMs / 3)));
  try {
    const result = await dependencies.adapter.run({
      text: segment.spokenText,
      voice: payload.data.voice,
      rate: payload.data.rate,
      pitch: payload.data.pitch,
      attemptDir: safeAttemptDir(dependencies.attemptRoot, claim.taskId, claim.taskStepId, claim.attempt),
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      const current = await dependencies.prisma.generationTask.findUniqueOrThrow({ where: { id: task.id } });
      return current.status === "CANCELLED" ? "CANCELLED" : "QUEUED";
    }
    if (result.bytes.byteLength <= 2_000 || result.durationMs < 200) {
      throw new WorkerError("AUDIO_OUTPUT_INVALID", "音频文件为空或时长无效。", true);
    }
    const sha256 = createHash("sha256").update(result.bytes).digest("hex");
    const storageKey = await dependencies.assets.putAudioSegment(task.projectId, sha256, result.bytes);
    const currentSegment = {
      id: stableId("audio_segment", `${task.id}:${segment.narrationId}`),
      taskId: task.id,
      projectId: task.projectId,
      presentationId: task.presentationId,
      revisionId: segment.revisionId,
      slideId: segment.slideId,
      narrationId: segment.narrationId,
      slideOrder: segment.slideOrder,
      segmentOrder: segment.segmentOrder,
      displayText: segment.displayText,
      spokenText: segment.spokenText,
      durationMs: result.durationMs,
      assetId: stableId("asset", `${task.projectId}:AUDIO_SEGMENT:${sha256}`),
      sha256,
      voice: payload.data.voice,
      rate: payload.data.rate,
      pitch: payload.data.pitch,
      inputHash: segment.inputHash,
    };
    const allSegments = [...task.audioSegments, currentSegment]
      .sort((a, b) => a.slideOrder - b.slideOrder || a.segmentOrder - b.segmentOrder);
    const isFinal = allSegments.length === payload.data.segments.length;
    const cues = isFinal ? buildCues(task.id, allSegments) : [];
    const srtBytes = isFinal ? Buffer.from(buildSrt(cues), "utf8") : null;
    const srtSha = srtBytes ? createHash("sha256").update(srtBytes).digest("hex") : null;
    const srtStorageKey = srtBytes && srtSha ? await dependencies.assets.putCaptions(task.projectId, srtSha, srtBytes) : null;
    const completedAt = new Date();
    await dependencies.prisma.$transaction(async (transaction) => {
      const owned = await transaction.generationTaskStep.updateMany({
        where: { id: claim.taskStepId, workerId, currentAttempt: claim.attempt, status: "RUNNING" },
        data: {
          status: "SUCCEEDED", progressCompleted: 1, progressTotal: 1, workerId: null,
          leaseExpiresAt: null, completedAt, outputHash: sha256, errorCode: null, errorMessage: null,
        },
      });
      if (owned.count !== 1) throw new WorkerError("LEASE_LOST", "Worker 已失去音频步骤租约。", true);
      await transaction.asset.upsert({
        where: { projectId_kind_sha256: { projectId: task.projectId, kind: "AUDIO_SEGMENT", sha256 } },
        update: {},
        create: { id: currentSegment.assetId, projectId: task.projectId, taskId: task.id, kind: "AUDIO_SEGMENT", storageKey, sha256, mimeType: "audio/mpeg", fileSize: result.bytes.byteLength },
      });
      const asset = await transaction.asset.findUniqueOrThrow({
        where: { projectId_kind_sha256: { projectId: task.projectId, kind: "AUDIO_SEGMENT", sha256 } },
      });
      await transaction.audioSegment.create({ data: { ...currentSegment, assetId: asset.id } });
      await transaction.taskStepAttempt.update({
        where: { taskStepId_attempt: { taskStepId: claim.taskStepId, attempt: claim.attempt } },
        data: { status: "SUCCEEDED", completedAt },
      });
      if (isFinal && srtBytes && srtSha && srtStorageKey) {
        const srtId = stableId("asset", `${task.projectId}:CAPTIONS_SRT:${srtSha}`);
        await transaction.asset.upsert({
          where: { projectId_kind_sha256: { projectId: task.projectId, kind: "CAPTIONS_SRT", sha256: srtSha } },
          update: {},
          create: { id: srtId, projectId: task.projectId, taskId: task.id, kind: "CAPTIONS_SRT", storageKey: srtStorageKey, sha256: srtSha, mimeType: "application/x-subrip; charset=utf-8", fileSize: srtBytes.byteLength },
        });
        const srtAsset = await transaction.asset.findUniqueOrThrow({
          where: { projectId_kind_sha256: { projectId: task.projectId, kind: "CAPTIONS_SRT", sha256: srtSha } },
        });
        await transaction.subtitleCue.createMany({ data: cues });
        await transaction.audioTimelineRecord.create({
          data: { id: stableId("audio_timeline", task.id), taskId: task.id, srtAssetId: srtAsset.id, totalDurationMs: cues.at(-1)!.endMs },
        });
      }
      await transaction.generationTask.update({
        where: { id: task.id },
        data: {
          status: isFinal ? "SUCCEEDED" : "RUNNING",
          progressCompleted: allSegments.length,
          completedAt: isFinal ? completedAt : null,
          heartbeatAt: completedAt,
          statusVersion: { increment: 1 },
          errorCode: null,
          errorMessage: null,
        },
      });
    });
    return "SUCCEEDED";
  } catch (error) {
    const current = await dependencies.prisma.generationTask.findUnique({ where: { id: task.id } });
    if (current?.status === "CANCELLED") return "CANCELLED";
    const publicError = error instanceof WorkerError
      ? error
      : new WorkerError("AUDIO_WORKER_FAILED", "音频 Worker 执行失败。", true);
    return failProductStep(dependencies.pool, claim, workerId, publicError.code, publicError.message, publicError.retryable, dependencies.maxAttempts);
  } finally {
    clearInterval(timer);
    controller.abort();
  }
}

function buildCues(taskId: string, segments: Array<{ id: string; durationMs: number; displayText: string }>) {
  let cursor = 0;
  return segments.map((segment, index) => {
    const startMs = cursor;
    cursor += segment.durationMs;
    return {
      id: stableId("subtitle_cue", `${taskId}:${index + 1}`), taskId,
      audioSegmentId: segment.id, cueIndex: index + 1, startMs, endMs: cursor, text: segment.displayText,
    };
  });
}

function buildSrt(cues: Array<{ cueIndex: number; startMs: number; endMs: number; text: string }>): string {
  return `${cues.map((cue) => `${cue.cueIndex}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${cue.text}`).join("\n\n")}\n`;
}

function srtTime(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const millis = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function safeAttemptDir(root: string, taskId: string, stepId: string, attempt: number): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, taskId, stepId, `attempt-${attempt}`);
  if (!target.startsWith(`${resolvedRoot}${sep}`)) throw new Error("Attempt path escaped the configured root.");
  return target;
}
