import { z } from "zod";
import { ApiMetaSchema } from "./api";
import { AssetIdSchema, PresentationIdSchema, TaskIdSchema } from "./primitives";
import { RenderFpsSchema } from "./render";
import { TaskSchema } from "./task";

export const CompositeTaskCreateRequestSchema = z.object({
  presentationId: PresentationIdSchema,
  renderTaskId: TaskIdSchema,
  audioTaskId: TaskIdSchema,
  idempotencyKey: z.string().min(8).max(128),
}).strict();
export const CompositeTaskResponseSchema = z.object({ data: TaskSchema, meta: ApiMetaSchema }).strict();

export const MediaValidationReportSchema = z.object({
  status: z.enum(["passed", "failed"]),
  videoCodec: z.string(), audioCodec: z.string(), pixelFormat: z.string(), fps: RenderFpsSchema,
  width: z.literal(1920), height: z.literal(1080), durationMs: z.number().int().min(1),
  expectedDurationMs: z.number().int().min(1), fastStart: z.boolean(), fullDecode: z.boolean(),
  nonSilent: z.boolean(), maxBlackDurationMs: z.number().int().min(0),
  pageCount: z.number().int().min(1), pageCoverage: z.array(z.number().int().min(1)).min(1),
  obstructionClear: z.boolean(), errors: z.array(z.string()),
}).strict().superRefine((report, context) => {
  if (report.status === "passed" && (report.errors.length || !report.fastStart || !report.fullDecode || !report.nonSilent || !report.obstructionClear)) {
    context.addIssue({ code: "custom", message: "通过的媒体报告不能包含失败硬门" });
  }
});

export const FinalMediaSchema = z.object({
  taskId: TaskIdSchema,
  renderTaskId: TaskIdSchema,
  audioTaskId: TaskIdSchema,
  videoAssetId: AssetIdSchema,
  captionsAssetId: AssetIdSchema,
  totalDurationMs: z.number().int().min(1),
  fps: RenderFpsSchema,
  validation: MediaValidationReportSchema,
}).strict();
export const FinalMediaResponseSchema = z.object({ data: FinalMediaSchema, meta: ApiMetaSchema }).strict();

export type CompositeTaskCreateRequest = z.infer<typeof CompositeTaskCreateRequestSchema>;
export type MediaValidationReport = z.infer<typeof MediaValidationReportSchema>;
export type FinalMedia = z.infer<typeof FinalMediaSchema>;
