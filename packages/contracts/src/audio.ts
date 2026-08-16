import { z } from "zod";

import { ApiMetaSchema } from "./api";
import {
  AssetIdSchema,
  PresentationIdSchema,
  ProjectIdSchema,
  RevisionIdSchema,
  SlideIdSchema,
  StableIdSchema,
  TaskIdSchema,
} from "./primitives";
import { TaskSchema } from "./task";

export const EdgeVoiceSchema = z.string().regex(/^zh-CN-[A-Za-z]+Neural$/).max(100);
export const EdgeRateSchema = z.string().regex(/^[+-]\d{1,3}%$/);
export const EdgePitchSchema = z.string().regex(/^[+-]\d{1,3}Hz$/);

export const AudioTaskCreateRequestSchema = z
  .object({
    presentationId: PresentationIdSchema,
    idempotencyKey: z.string().min(8).max(128),
    voice: EdgeVoiceSchema,
    rate: EdgeRateSchema,
    pitch: EdgePitchSchema,
  })
  .strict();

export const AudioTaskResponseSchema = z.object({ data: TaskSchema, meta: ApiMetaSchema }).strict();

export const AudioSegmentSchema = z
  .object({
    id: StableIdSchema,
    taskId: TaskIdSchema,
    revisionId: RevisionIdSchema,
    slideId: SlideIdSchema,
    narrationId: StableIdSchema,
    slideOrder: z.number().int().min(1),
    segmentOrder: z.number().int().min(0),
    displayText: z.string().min(1).max(10_000),
    spokenText: z.string().min(1).max(10_000),
    durationMs: z.number().int().min(200),
    assetId: AssetIdSchema,
    previewUrl: z.string().regex(/^\/api\/t\/assets\/[A-Za-z0-9_-]+\/audio-preview$/).optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const SubtitleCueSchema = z
  .object({
    id: StableIdSchema,
    audioSegmentId: StableIdSchema,
    index: z.number().int().min(1),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(1),
    text: z.string().min(1).max(10_000),
  })
  .strict()
  .refine((cue) => cue.endMs > cue.startMs, { message: "字幕结束时间必须晚于开始时间" });

export const AudioTimelineSchema = z
  .object({
    taskId: TaskIdSchema,
    projectId: ProjectIdSchema,
    presentationId: PresentationIdSchema,
    voice: EdgeVoiceSchema,
    rate: EdgeRateSchema,
    pitch: EdgePitchSchema,
    totalDurationMs: z.number().int().min(1),
    segments: z.array(AudioSegmentSchema).min(1),
    cues: z.array(SubtitleCueSchema).min(1),
    srtAssetId: AssetIdSchema,
  })
  .strict()
  .superRefine((timeline, context) => {
    if (timeline.segments.length !== timeline.cues.length) {
      context.addIssue({ code: "custom", path: ["cues"], message: "字幕数量必须与逐句音频一致" });
    }
    for (let index = 0; index < timeline.cues.length; index += 1) {
      const cue = timeline.cues[index];
      if (cue.index !== index + 1) {
        context.addIssue({ code: "custom", path: ["cues", index, "index"], message: "字幕序号必须连续" });
      }
      if (index > 0 && cue.startMs < timeline.cues[index - 1].endMs) {
        context.addIssue({ code: "custom", path: ["cues", index, "startMs"], message: "字幕时间不能重叠" });
      }
    }
    if (timeline.cues.at(-1)?.endMs !== timeline.totalDurationMs) {
      context.addIssue({ code: "custom", path: ["totalDurationMs"], message: "总时长必须等于最后字幕结束时间" });
    }
  });

export const AudioTimelineResponseSchema = z.object({ data: AudioTimelineSchema, meta: ApiMetaSchema }).strict();

export type AudioTaskCreateRequest = z.infer<typeof AudioTaskCreateRequestSchema>;
export type AudioTimeline = z.infer<typeof AudioTimelineSchema>;
