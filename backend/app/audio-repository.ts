import { createHash, randomUUID } from "node:crypto";
import {
  AudioTimelineSchema,
  LessonPlanRevisionSchema,
  type AudioTaskCreateRequest,
  type AudioTimeline,
} from "@ppt-digital-human/contracts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { AppHttpError, isUniqueViolation } from "./errors.ts";
import { stableHash } from "./lesson-plan-builder.ts";

export interface AudioRequestedPayload {
  voice: string;
  rate: string;
  pitch: string;
  revisions: string[];
  segments: Array<{
    revisionId: string;
    slideId: string;
    narrationId: string;
    slideOrder: number;
    segmentOrder: number;
    displayText: string;
    spokenText: string;
    inputHash: string;
  }>;
}

export class AudioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createTask(principal: string, projectId: string, input: AudioTaskCreateRequest) {
    const presentation = await this.prisma.presentation.findFirst({
      where: { id: input.presentationId, projectId, project: { principal } },
      include: {
        slides: {
          orderBy: { slideNumber: "asc" },
          include: {
            lessonPlan: { include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } },
          },
        },
      },
    });
    if (!presentation) throw new AppHttpError(404, "PRESENTATION_NOT_FOUND", "演示文稿不存在。", false);
    if (presentation.parseStatus !== "COMPLETED" || presentation.slides.length === 0) {
      throw new AppHttpError(409, "PRESENTATION_NOT_PARSED", "演示文稿尚未完成解析。", false);
    }
    const revisions = presentation.slides.map((slide) => {
      const record = slide.lessonPlan?.revisions[0];
      if (!record || slide.lessonPlan?.currentRevision !== record.revision || record.approvalStatus !== "approved") {
        throw new AppHttpError(409, "LESSON_PLAN_NOT_APPROVED", "所有当前讲稿修订必须先批准。", false);
      }
      return { slide, revision: LessonPlanRevisionSchema.parse(record.payload as unknown) };
    });
    const segments: AudioRequestedPayload["segments"] = revisions.flatMap(({ slide, revision }) =>
      revision.narration.map((segment, segmentOrder) => ({
        revisionId: revision.id,
        slideId: slide.id,
        narrationId: segment.id,
        slideOrder: slide.slideNumber,
        segmentOrder,
        displayText: segment.displayText,
        spokenText: segment.spokenText,
        inputHash: stableHash({
          revisionId: revision.id,
          narrationId: segment.id,
          spokenText: segment.spokenText,
          voice: input.voice,
          rate: input.rate,
          pitch: input.pitch,
        }),
      })),
    );
    if (segments.length === 0) {
      throw new AppHttpError(409, "NARRATION_EMPTY", "已批准讲稿不包含可合成的逐句文本。", false);
    }
    const payload: AudioRequestedPayload = {
      voice: input.voice,
      rate: input.rate,
      pitch: input.pitch,
      revisions: revisions.map(({ revision }) => revision.id),
      segments,
    };
    const inputHash = stableHash({ presentationRevision: presentation.revision, payload });
    const existing = await this.prisma.generationTask.findFirst({
      where: { principal, kind: "AUDIO", idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.inputHash !== inputHash) {
        throw new AppHttpError(409, "IDEMPOTENCY_KEY_REUSED", "该幂等键已用于不同的音频请求。", false);
      }
      return { task: existing, created: false };
    }
    const taskId = `task_${randomUUID()}`;
    try {
      const task = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.generationTask.create({
          data: {
            id: taskId,
            principal,
            projectId,
            presentationId: presentation.id,
            kind: "AUDIO",
            idempotencyKey: input.idempotencyKey,
            inputHash,
            configHash: createHash("sha256").update(`${input.voice}:${input.rate}:${input.pitch}`).digest("hex"),
            status: "QUEUED",
            stage: "AUDIO",
            progressTotal: segments.length,
            presentationRevision: presentation.revision,
          },
        });
        await transaction.taskOutbox.create({
          data: {
            id: `outbox_${randomUUID()}`,
            taskId,
            eventKey: `audio.requested:${taskId}`,
            eventType: "AUDIO_REQUESTED",
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
        return created;
      });
      return { task, created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.prisma.generationTask.findFirst({
          where: { principal, kind: "AUDIO", idempotencyKey: input.idempotencyKey },
        });
        if (replay?.inputHash === inputHash) return { task: replay, created: false };
      }
      throw error;
    }
  }

  async getTimeline(principal: string, taskId: string): Promise<AudioTimeline> {
    const task = await this.prisma.generationTask.findFirst({
      where: { id: taskId, principal, kind: "AUDIO" },
      include: {
        outbox: { where: { eventType: "AUDIO_REQUESTED" }, take: 1 },
        audioSegments: { orderBy: [{ slideOrder: "asc" }, { segmentOrder: "asc" }] },
        subtitleCues: { orderBy: { cueIndex: "asc" } },
        audioTimeline: true,
      },
    });
    if (!task) throw new AppHttpError(404, "AUDIO_TASK_NOT_FOUND", "音频任务不存在。", false);
    if (task.status !== "SUCCEEDED") {
      throw new AppHttpError(409, "AUDIO_NOT_READY", "音频与字幕时间轴尚未完成。", task.status !== "FAILED");
    }
    const payload = task.outbox[0]?.payload as unknown as AudioRequestedPayload | undefined;
    const timeline = task.audioTimeline;
    if (!payload || !timeline) throw new AppHttpError(500, "AUDIO_OUTPUT_INCOMPLETE", "音频输出不完整。", false);
    return AudioTimelineSchema.parse({
      taskId: task.id,
      projectId: task.projectId,
      presentationId: task.presentationId,
      voice: payload.voice,
      rate: payload.rate,
      pitch: payload.pitch,
      totalDurationMs: timeline.totalDurationMs,
      segments: task.audioSegments.map((segment) => ({
        id: segment.id,
        taskId: segment.taskId,
        revisionId: segment.revisionId,
        slideId: segment.slideId,
        narrationId: segment.narrationId,
        slideOrder: segment.slideOrder,
        segmentOrder: segment.segmentOrder,
        displayText: segment.displayText,
        spokenText: segment.spokenText,
        durationMs: segment.durationMs,
        assetId: segment.assetId,
        sha256: segment.sha256,
      })),
      cues: task.subtitleCues.map((cue) => ({
        id: cue.id,
        audioSegmentId: cue.audioSegmentId,
        index: cue.cueIndex,
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: cue.text,
      })),
      srtAssetId: timeline.srtAssetId,
    });
  }
}
