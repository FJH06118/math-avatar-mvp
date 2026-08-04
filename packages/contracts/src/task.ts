import { z } from "zod";

import { ApprovedLessonPlanRevisionSchema } from "./lesson-plan";
import {
  IsoDateTimeSchema,
  PresentationIdSchema,
  ProgressSchema,
  ProjectIdSchema,
  SlideIdSchema,
  StableIdSchema,
  TaskIdSchema,
  TaskStepIdSchema,
} from "./primitives";
import { TeachingSettingsSchema } from "./project";

export const TaskKindSchema = z.enum([
  "PARSE",
  "PLAN",
  "AUDIO",
  "PREVIEW",
  "GENERATE",
  "VALIDATE",
]);

export const TaskStatusSchema = z.enum([
  "CREATED",
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const TaskStageSchema = z.enum([
  "PARSE",
  "PLAN",
  "AUDIO",
  "PAGE_RENDER",
  "COMPOSITE",
  "VALIDATE",
]);

export const TaskSchema = z
  .object({
    id: TaskIdSchema,
    projectId: ProjectIdSchema,
    presentationId: PresentationIdSchema,
    kind: TaskKindSchema,
    status: TaskStatusSchema,
    stage: TaskStageSchema,
    progressCompleted: z.number().int().min(0),
    progressTotal: z.number().int().min(1),
    currentSlideId: SlideIdSchema.optional(),
    idempotencyKey: StableIdSchema,
    inputHash: z.string().min(1).max(128),
    configHash: z.string().min(1).max(128),
    presentationRevision: z.number().int().min(1),
    lessonPlanSnapshotHash: z.string().min(1).max(128).optional(),
    settingsHash: z.string().min(1).max(128).optional(),
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
  .superRefine((task, context) => {
    if (task.progressCompleted > task.progressTotal) {
      context.addIssue({
        code: "custom",
        path: ["progressCompleted"],
        message: "已完成工作量不能超过总工作量",
      });
    }
    if (task.status === "SUCCEEDED" && !task.completedAt) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "成功任务必须记录完成时间",
      });
    }
  });

export const TaskStepSchema = z
  .object({
    id: TaskStepIdSchema,
    taskId: TaskIdSchema,
    stage: TaskStageSchema,
    slideId: SlideIdSchema.optional(),
    status: TaskStatusSchema,
    currentAttempt: z.number().int().min(0),
    inputHash: z.string().min(1).max(128),
    outputHash: z.string().min(1).max(128).optional(),
    progressCompleted: z.number().int().min(0),
    progressTotal: z.number().int().min(1),
    workerId: StableIdSchema.optional(),
    heartbeatAt: IsoDateTimeSchema.optional(),
    leaseExpiresAt: IsoDateTimeSchema.optional(),
    errorCode: z.string().min(1).max(100).optional(),
    errorMessage: z.string().max(2_000).optional(),
    startedAt: IsoDateTimeSchema.optional(),
    completedAt: IsoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((step, context) => {
    if (step.progressCompleted > step.progressTotal) {
      context.addIssue({
        code: "custom",
        path: ["progressCompleted"],
        message: "已完成工作量不能超过总工作量",
      });
    }
  });

export const GenerateTaskInputSchema = z
  .object({
    projectId: ProjectIdSchema,
    presentationId: PresentationIdSchema,
    idempotencyKey: StableIdSchema,
    approvedRevision: ApprovedLessonPlanRevisionSchema,
    settings: TeachingSettingsSchema,
  })
  .strict();

export type Task = z.infer<typeof TaskSchema>;
export type TaskStep = z.infer<typeof TaskStepSchema>;

// Current Mock API task projection. The production task contract above remains
// uppercase and persistent; this view keeps the existing demo UI stable.
export const JobTypeSchema = z.enum(["parsing", "rendering"]);
export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const JobStageStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const JobStageSchema = z
  .object({
    id: StableIdSchema,
    label: z.string().min(1).max(200),
    description: z.string().min(1).max(500),
    status: JobStageStatusSchema,
    progress: ProgressSchema,
  })
  .strict();

export const JobSchema = z
  .object({
    id: TaskIdSchema,
    projectId: ProjectIdSchema,
    type: JobTypeSchema,
    status: JobStatusSchema,
    progress: ProgressSchema,
    currentStageId: StableIdSchema,
    currentSlideId: SlideIdSchema.optional(),
    stages: z.array(JobStageSchema).min(1).max(20),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    error: z.string().max(2_000).optional(),
    errorCode: z.string().min(1).max(100).optional(),
    retryable: z.boolean().optional(),
  })
  .strict();

export type Job = z.infer<typeof JobSchema>;
export type JobStage = z.infer<typeof JobStageSchema>;
export type JobType = z.infer<typeof JobTypeSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type JobStageStatus = z.infer<typeof JobStageStatusSchema>;
