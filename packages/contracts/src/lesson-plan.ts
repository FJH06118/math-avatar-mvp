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
import { AnimationDispositionSchema, AnimationTeachingUnderstandingSchema } from "./animation";

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
  animationUnderstanding: AnimationTeachingUnderstandingSchema.optional(),
  /**
   * M1 动画处置。与 COM 动画事实分离，随本修订一起冻结与批准。
   * 含动画页面缺少匹配处置时，GENERATE/Workflow 必须返回 ANIMATION_REVIEW_REQUIRED。
   */
  animationDisposition: AnimationDispositionSchema.nullable().optional(),
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
    const disposition = revision.animationDisposition;
    if (disposition && disposition.slideId !== revision.slideId) {
      context.addIssue({
        code: "custom",
        path: ["animationDisposition", "slideId"],
        message: "动画处置必须属于本修订对应的页面",
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

/**
 * M1：用户为某一页选择动画处置的请求。
 *
 * `slideId` / `manifestHash` / `decidedAt` 由服务端派生，客户端**不能**指定，
 * 因此这里只接受模式与依据；`expectedRevision` 用于乐观并发。
 */
export const AnimationDispositionDecisionRequestSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    mode: z.enum(["ACCEPT_STATIC", "PRESERVE_NATIVE"]),
    reason: z.string().min(1).max(1_000).optional(),
  })
  .strict();

export type AnimationDispositionDecisionRequest = z.infer<
  typeof AnimationDispositionDecisionRequestSchema
>;

export type LessonPlanRevision = z.infer<typeof LessonPlanRevisionSchema>;
export type ApprovedLessonPlanRevision = z.infer<
  typeof ApprovedLessonPlanRevisionSchema
>;
