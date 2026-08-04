import { createHash, randomUUID } from "node:crypto";
import { FinalMediaSchema, MediaValidationReportSchema, type CompositeTaskCreateRequest } from "@ppt-digital-human/contracts";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { AppHttpError, isUniqueViolation } from "./errors.ts";
import { stableHash } from "./lesson-plan-builder.ts";

export interface CompositeRequestedPayload {
  renderTaskId: string;
  audioTaskId: string;
  fps: 25 | 30;
  totalDurationMs: number;
  captions: { assetId: string; sha256: string };
  pages: Array<{ pageOrder: number; durationMs: number; videoAssetId: string; videoSha256: string; frameAssetId: string; frameSha256: string }>;
}

export class MediaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createTask(principal: string, projectId: string, input: CompositeTaskCreateRequest) {
    const presentation = await this.prisma.presentation.findFirst({ where: { id: input.presentationId, projectId, project: { principal } } });
    if (!presentation) throw new AppHttpError(404, "PRESENTATION_NOT_FOUND", "演示文稿不存在。", false);
    const renderTask = await this.prisma.generationTask.findFirst({
      where: { id: input.renderTaskId, principal, projectId, presentationId: presentation.id, kind: "GENERATE", stage: "PAGE_RENDER", status: "SUCCEEDED" },
      include: { renderedPages: { orderBy: { pageOrder: "asc" } } },
    });
    if (!renderTask || renderTask.renderedPages.length !== presentation.slideCount) throw new AppHttpError(409, "PAGE_RENDER_NOT_READY", "必须先完成全部分页视频。", false);
    const audioTask = await this.prisma.generationTask.findFirst({
      where: { id: input.audioTaskId, principal, projectId, presentationId: presentation.id, kind: "AUDIO", status: "SUCCEEDED" },
      include: { audioTimeline: true },
    });
    if (!audioTask?.audioTimeline) throw new AppHttpError(409, "AUDIO_NOT_READY", "音频时间轴尚未完成。", false);
    const captions = await this.prisma.asset.findFirst({ where: { id: audioTask.audioTimeline.srtAssetId, projectId, lifecycle: "AVAILABLE" } });
    if (!captions) throw new AppHttpError(409, "CAPTIONS_NOT_READY", "字幕资产不可用。", false);
    const fps = renderTask.renderedPages[0]?.fps;
    if ((fps !== 25 && fps !== 30) || renderTask.renderedPages.some((page) => page.fps !== fps || page.durationMs < 1_500)) throw new AppHttpError(409, "PAGE_MEDIA_INVALID", "分页视频规格不一致。", false);
    const totalDurationMs = renderTask.renderedPages.reduce((total, page) => total + page.durationMs, 0);
    if (Math.abs(totalDurationMs - audioTask.audioTimeline.totalDurationMs) > 10) throw new AppHttpError(409, "TIMELINE_MISMATCH", "分页时长与音频时间轴不一致。", false);
    const payload: CompositeRequestedPayload = {
      renderTaskId: renderTask.id, audioTaskId: audioTask.id, fps, totalDurationMs,
      captions: { assetId: captions.id, sha256: captions.sha256 },
      pages: renderTask.renderedPages.map((page) => ({ pageOrder: page.pageOrder, durationMs: page.durationMs, videoAssetId: page.videoAssetId, videoSha256: page.videoSha256, frameAssetId: page.frameAssetId, frameSha256: page.frameSha256 })),
    };
    const inputHash = stableHash(payload);
    const existing = await this.prisma.generationTask.findFirst({ where: { principal, kind: "VALIDATE", idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.inputHash !== inputHash) throw new AppHttpError(409, "IDEMPOTENCY_KEY_REUSED", "该幂等键已用于不同的合成请求。", false);
      return { task: existing, created: false };
    }
    const taskId = `task_${randomUUID()}`;
    try {
      const task = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.generationTask.create({ data: {
          id: taskId, principal, projectId, presentationId: presentation.id, kind: "VALIDATE",
          idempotencyKey: input.idempotencyKey, inputHash,
          configHash: createHash("sha256").update(`stage-tf-composite-v1:${fps}`).digest("hex"),
          status: "QUEUED", stage: "COMPOSITE", progressTotal: 2, presentationRevision: presentation.revision,
        } });
        await transaction.taskOutbox.create({ data: { id: `outbox_${randomUUID()}`, taskId, eventKey: `composite.requested:${taskId}`, eventType: "COMPOSITE_REQUESTED", payload: payload as unknown as Prisma.InputJsonValue } });
        return created;
      });
      return { task, created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.prisma.generationTask.findFirst({ where: { principal, kind: "VALIDATE", idempotencyKey: input.idempotencyKey } });
        if (replay?.inputHash === inputHash) return { task: replay, created: false };
      }
      throw error;
    }
  }

  async getFinalMedia(principal: string, taskId: string) {
    const task = await this.prisma.generationTask.findFirst({ where: { id: taskId, principal, kind: "VALIDATE" }, include: { mediaOutput: { include: { validation: true } } } });
    if (!task) throw new AppHttpError(404, "MEDIA_TASK_NOT_FOUND", "媒体任务不存在。", false);
    if (task.status !== "SUCCEEDED" || task.mediaOutput?.status !== "VALIDATED" || !task.mediaOutput.validation) throw new AppHttpError(409, "MEDIA_NOT_READY", "媒体尚未通过最终验证。", task.status !== "FAILED");
    return FinalMediaSchema.parse({
      taskId: task.id, renderTaskId: task.mediaOutput.renderTaskId, audioTaskId: task.mediaOutput.audioTaskId,
      videoAssetId: task.mediaOutput.videoAssetId, captionsAssetId: task.mediaOutput.captionsAssetId,
      totalDurationMs: task.mediaOutput.totalDurationMs, fps: task.mediaOutput.fps,
      validation: MediaValidationReportSchema.parse(task.mediaOutput.validation.report as unknown),
    });
  }
}
