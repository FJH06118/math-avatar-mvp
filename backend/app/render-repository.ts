import { createHash, randomUUID } from "node:crypto";
import {
  LessonPlanRevisionSchema,
  RenderedPageListResponseSchema,
  type RenderTaskCreateRequest,
} from "@ppt-digital-human/contracts";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { AppHttpError, isUniqueViolation } from "./errors.ts";
import { stableHash } from "./lesson-plan-builder.ts";

export interface RenderRequestedPayload {
  fps: 25 | 30;
  audioTaskId: string;
  pages: Array<{
    slideId: string;
    revisionId: string;
    pageOrder: number;
    durationMs: number;
    sourceAssetId: string;
    sourceSha256: string;
    audio: Array<{ assetId: string; sha256: string; durationMs: number }>;
    overlay?: unknown;
    inputHash: string;
  }>;
}

export class RenderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createTask(principal: string, projectId: string, input: RenderTaskCreateRequest) {
    const presentation = await this.prisma.presentation.findFirst({
      where: { id: input.presentationId, projectId, project: { principal } },
      include: {
        slides: {
          orderBy: { slideNumber: "asc" },
          include: {
            renderAsset: true,
            lessonPlan: { include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } },
          },
        },
      },
    });
    if (!presentation) throw new AppHttpError(404, "PRESENTATION_NOT_FOUND", "演示文稿不存在。", false);
    const audioTask = await this.prisma.generationTask.findFirst({
      where: { id: input.audioTaskId, principal, projectId, presentationId: presentation.id, kind: "AUDIO", status: "SUCCEEDED" },
      include: { audioSegments: { orderBy: [{ slideOrder: "asc" }, { segmentOrder: "asc" }] }, audioTimeline: true },
    });
    if (!audioTask?.audioTimeline) throw new AppHttpError(409, "AUDIO_NOT_READY", "必须先完成同一演示文稿的音频任务。", false);
    if (presentation.slides.length !== presentation.slideCount || presentation.slides.some((slide) => !slide.renderAsset)) {
      throw new AppHttpError(409, "PARSE_OUTPUT_INCOMPLETE", "原页面资产不完整。", false);
    }
    const pages: RenderRequestedPayload["pages"] = presentation.slides.map((slide) => {
      const revisionRecord = slide.lessonPlan?.revisions[0];
      if (!revisionRecord || revisionRecord.approvalStatus !== "approved" || slide.lessonPlan?.currentRevision !== revisionRecord.revision) {
        throw new AppHttpError(409, "LESSON_PLAN_NOT_APPROVED", "所有当前讲稿修订必须先批准。", false);
      }
      const revision = LessonPlanRevisionSchema.parse(revisionRecord.payload as unknown);
      const audio = audioTask.audioSegments.filter((segment) => segment.slideId === slide.id && segment.revisionId === revision.id);
      if (audio.length !== revision.narration.length) {
        throw new AppHttpError(409, "AUDIO_SNAPSHOT_MISMATCH", "音频任务与当前已批准讲稿不一致。", false);
      }
      const durationMs = audio.reduce((total, segment) => total + segment.durationMs, 0);
      if (durationMs < 1_500) throw new AppHttpError(409, "PAGE_DURATION_TOO_SHORT", "每个页面镜头必须不少于 1.5 秒。", false);
      if (revision.scenes.length !== 1) throw new AppHttpError(409, "MULTI_SCENE_UNSUPPORTED", "阶段 T 每页只支持一个已批准场景。", false);
      const overlay = revision.scenes[0].overlay;
      if (overlay && overlay.type !== "highlightBox" && overlay.type !== "arrow") {
        throw new AppHttpError(409, "OVERLAY_UNSUPPORTED", "阶段 T 只支持 highlightBox 或 arrow。", false);
      }
      const snapshot = {
        slideId: slide.id,
        revisionId: revision.id,
        pageOrder: slide.slideNumber,
        durationMs,
        sourceAssetId: slide.renderAsset!.id,
        sourceSha256: slide.renderAsset!.sha256,
        audio: audio.map((segment) => ({ assetId: segment.assetId, sha256: segment.sha256, durationMs: segment.durationMs })),
        overlay,
      };
      return { ...snapshot, inputHash: stableHash({ ...snapshot, fps: input.fps, rendererVersion: "stage-te-sharp-ffmpeg-v1" }) };
    });
    const payload: RenderRequestedPayload = { fps: input.fps, audioTaskId: audioTask.id, pages };
    const inputHash = stableHash({ presentationRevision: presentation.revision, payload });
    const existing = await this.prisma.generationTask.findFirst({ where: { principal, kind: "GENERATE", idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.inputHash !== inputHash) throw new AppHttpError(409, "IDEMPOTENCY_KEY_REUSED", "该幂等键已用于不同的渲染请求。", false);
      return { task: existing, created: false };
    }
    const taskId = `task_${randomUUID()}`;
    try {
      const task = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.generationTask.create({ data: {
          id: taskId, principal, projectId, presentationId: presentation.id, kind: "GENERATE",
          idempotencyKey: input.idempotencyKey, inputHash,
          configHash: createHash("sha256").update(`stage-te-sharp-ffmpeg-v1:${input.fps}`).digest("hex"),
          status: "QUEUED", stage: "PAGE_RENDER", progressTotal: pages.length, presentationRevision: presentation.revision,
        } });
        await transaction.taskOutbox.create({ data: {
          id: `outbox_${randomUUID()}`, taskId, eventKey: `render.requested:${taskId}`,
          eventType: "RENDER_REQUESTED", payload: payload as unknown as Prisma.InputJsonValue,
        } });
        return created;
      });
      return { task, created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.prisma.generationTask.findFirst({ where: { principal, kind: "GENERATE", idempotencyKey: input.idempotencyKey } });
        if (replay?.inputHash === inputHash) return { task: replay, created: false };
      }
      throw error;
    }
  }

  async listPages(principal: string, taskId: string) {
    const task = await this.prisma.generationTask.findFirst({
      where: { id: taskId, principal, kind: "GENERATE", stage: "PAGE_RENDER" },
      include: { renderedPages: { orderBy: { pageOrder: "asc" } } },
    });
    if (!task) throw new AppHttpError(404, "RENDER_TASK_NOT_FOUND", "分页渲染任务不存在。", false);
    if (task.status !== "SUCCEEDED") throw new AppHttpError(409, "RENDER_NOT_READY", "分页渲染尚未完成。", task.status !== "FAILED");
    return RenderedPageListResponseSchema.shape.data.parse(task.renderedPages.map((page) => ({
      id: page.id, taskId: page.taskId, slideId: page.slideId, revisionId: page.revisionId,
      pageOrder: page.pageOrder, durationMs: page.durationMs, fps: page.fps,
      width: page.width, height: page.height, frameAssetId: page.frameAssetId,
      videoAssetId: page.videoAssetId, frameSha256: page.frameSha256, videoSha256: page.videoSha256,
      avatarPlacement: page.avatarPlacement, overlayType: page.overlayType ?? undefined,
    })));
  }
}
