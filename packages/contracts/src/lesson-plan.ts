import { z } from "zod";

import {
  IsoDateTimeSchema,
  LessonPlanIdSchema,
  RevisionIdSchema,
  SlideIdSchema,
  StableIdSchema,
} from "./primitives";
import {
  deriveSourceSlideCoverage,
  expectedSourceSlideCoverageSchema,
  PreservationModeSchema,
  SceneSchema,
} from "./scene";

export const NarrationSegmentSchema = z
  .object({
    id: StableIdSchema,
    displayText: z.string().min(1).max(10_000),
    spokenText: z.string().min(1).max(10_000),
  })
  .strict();

export const DerivationStepSchema = z
  .object({
    id: StableIdSchema,
    input: z.string().min(1).max(10_000),
    output: z.string().min(1).max(10_000),
    transformation: z.string().min(1).max(200),
    explanation: z.string().min(1).max(10_000),
    risk: z.enum(["L0", "L1", "L2", "L3"]),
  })
  .strict();

export const LessonPlanApprovalSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }).strict(),
  z
    .object({
      status: z.literal("approved"),
      approvedBy: StableIdSchema,
      approvedAt: IsoDateTimeSchema,
    })
    .strict(),
]);

const LessonPlanRevisionShape = {
  id: RevisionIdSchema,
  lessonPlanId: LessonPlanIdSchema,
  slideId: SlideIdSchema,
  revision: z.number().int().min(1),
  teachingGoal: z.string().min(1).max(5_000),
  narration: z.array(NarrationSegmentSchema).min(1).max(200),
  derivation: z.array(DerivationStepSchema).max(100),
  scenes: z.array(SceneSchema).min(1).max(100),
  sourceSlideCoverage: z.array(SlideIdSchema).min(1).max(100),
  preservationMode: PreservationModeSchema,
  estimatedDurationMs: z.number().int().min(1_500),
  modelProvider: z.string().min(1).max(100),
  modelName: z.string().min(1).max(200),
  promptVersion: z.string().min(1).max(100),
  schemaVersion: z.string().min(1).max(100),
  inputHash: z.string().min(1).max(128),
  outputHash: z.string().min(1).max(128),
  createdBy: z.enum(["agent", "user", "rule"]),
  createdAt: IsoDateTimeSchema,
  approval: LessonPlanApprovalSchema,
} as const;

export const LessonPlanRevisionSchema = z
  .object(LessonPlanRevisionShape)
  .strict()
  .superRefine((revision, context) => {
    const derivedCoverage = deriveSourceSlideCoverage(revision.scenes);
    if (
      JSON.stringify(revision.sourceSlideCoverage) !==
      JSON.stringify(derivedCoverage)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceSlideCoverage"],
        message: "sourceSlideCoverage 必须由当前场景重新派生",
      });
    }
  });

export const ApprovedLessonPlanRevisionSchema = LessonPlanRevisionSchema
  .superRefine((revision, context) => {
    if (revision.approval.status !== "approved") {
      context.addIssue({
        code: "custom",
        path: ["approval", "status"],
        message: "生成任务只能使用已批准的讲稿修订",
      });
    }
  });

export function createApprovedLessonPlanRevisionSchema(
  requiredSlideIds: readonly string[],
) {
  return ApprovedLessonPlanRevisionSchema.superRefine((revision, context) => {
    const result = expectedSourceSlideCoverageSchema(requiredSlideIds).safeParse(
      revision.sourceSlideCoverage,
    );
    if (!result.success) {
      context.addIssue({
        code: "custom",
        path: ["sourceSlideCoverage"],
        message: result.error.issues.map((issue) => issue.message).join("；"),
      });
    }
  });
}

export type LessonPlanRevision = z.infer<typeof LessonPlanRevisionSchema>;
export type ApprovedLessonPlanRevision = z.infer<
  typeof ApprovedLessonPlanRevisionSchema
>;
