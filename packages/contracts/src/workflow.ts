import { z } from "zod";

import { ApiMetaSchema, createApiSuccessSchema } from "./api";
import {
  IsoDateTimeSchema,
  PresentationIdSchema,
  ProjectIdSchema,
  SlideIdSchema,
  StableIdSchema,
  TaskIdSchema,
} from "./primitives";

export const WorkflowRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const WorkflowRunStageSchema = z.enum([
  "PLAN",
  "AUDIO",
  "PAGE_RENDER",
  "COMPOSITE",
  "VALIDATE",
]);

export const WorkflowRunCreateInputSchema = z
  .object({
    presentationId: PresentationIdSchema,
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const WorkflowRunRetryInputSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const WorkflowRunSchema = z
  .object({
    id: StableIdSchema,
    projectId: ProjectIdSchema,
    presentationId: PresentationIdSchema,
    status: WorkflowRunStatusSchema,
    currentStage: WorkflowRunStageSchema,
    progressCompleted: z.number().int().min(0),
    progressTotal: z.number().int().min(1),
    currentSlideId: SlideIdSchema.optional(),
    planTaskId: TaskIdSchema.optional(),
    audioTaskId: TaskIdSchema.optional(),
    renderTaskId: TaskIdSchema.optional(),
    compositeTaskId: TaskIdSchema.optional(),
    finalTaskId: TaskIdSchema.optional(),
    errorCode: z.string().min(1).max(100).optional(),
    errorMessage: z.string().max(2_000).optional(),
    retryCount: z.number().int().min(0),
    cancellationRequestedAt: IsoDateTimeSchema.optional(),
    heartbeatAt: IsoDateTimeSchema.optional(),
    leaseExpiresAt: IsoDateTimeSchema.optional(),
    statusVersion: z.number().int().min(1),
    startedAt: IsoDateTimeSchema.optional(),
    completedAt: IsoDateTimeSchema.optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((run, context) => {
    if (run.progressCompleted > run.progressTotal) {
      context.addIssue({
        code: "custom",
        path: ["progressCompleted"],
        message: "已完成工作量不能超过总工作量",
      });
    }
    if (run.status === "SUCCEEDED" && !run.completedAt) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "成功工作流必须记录完成时间",
      });
    }
    if (run.status === "SUCCEEDED" && !run.finalTaskId) {
      context.addIssue({
        code: "custom",
        path: ["finalTaskId"],
        message: "成功工作流必须关联最终媒体任务",
      });
    }
  });

export const WorkflowRunResponseSchema = z
  .object({ data: WorkflowRunSchema, meta: ApiMetaSchema })
  .strict();

export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type WorkflowRunCreateInput = z.infer<typeof WorkflowRunCreateInputSchema>;
export type WorkflowRunRetryInput = z.infer<typeof WorkflowRunRetryInputSchema>;
export type WorkflowRunStage = z.infer<typeof WorkflowRunStageSchema>;
