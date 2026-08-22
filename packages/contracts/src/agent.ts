import { z } from "zod";

import { DerivationStepSchema, NarrationSegmentSchema, LessonPlanRevisionSchema } from "./lesson-plan";
import { OverlaySchema } from "./overlays";
import { ApiMetaSchema } from "./api";
import { PresentationIdSchema, RevisionIdSchema, SlideIdSchema } from "./primitives";
import { PreservationModeSchema, SceneSchema } from "./scene";
import { TaskSchema } from "./task";
import { AnimationTeachingUnderstandingSchema } from "./animation";

const AgentNarrationSchema = NarrationSegmentSchema.omit({ id: true }).strict();
const AgentDerivationSchema = DerivationStepSchema.omit({ id: true }).strict();

export const AgentSceneCandidateSchema = z
  .object({
    durationMs: z.number().int().min(1_500).max(30 * 60 * 1_000),
    overlay: OverlaySchema.optional(),
  })
  .strict();

export const AgentSlidePlanSchema = z
  .object({
    slideId: SlideIdSchema,
    teachingGoal: z.string().min(1).max(5_000),
    narration: z.array(AgentNarrationSchema).min(1).max(40),
    derivation: z.array(AgentDerivationSchema).max(30),
    scenes: z.array(AgentSceneCandidateSchema).min(1).max(20),
    preservationMode: z.enum(["FULL_PRESERVE", "PRESERVE_WITH_OVERLAY"]),
    animationUnderstanding: AnimationTeachingUnderstandingSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    for (const [index, scene] of plan.scenes.entries()) {
      if (scene.overlay && scene.overlay.slideId !== plan.slideId) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "overlay", "slideId"],
          message: "Agent Overlay 必须关联当前页面",
        });
      }
    }
    plan.animationUnderstanding.interpretations.forEach((interpretation, index) => {
      const narrationIndex = interpretation.narrationSync.narrationSegmentIndex;
      if (narrationIndex !== null && narrationIndex >= plan.narration.length) {
        context.addIssue({
          code: "custom",
          path: ["animationUnderstanding", "interpretations", index, "narrationSync", "narrationSegmentIndex"],
          message: "动画同步建议必须引用本页存在的 narration 段落",
        });
      }
    });
  });

export const AgentPlanOutputSchema = z
  .object({
    schemaVersion: z.literal("stage-tc-agent-v2-animation"),
    slides: z.array(AgentSlidePlanSchema).min(1).max(100),
  })
  .strict();

export interface AgentAnimationFacts {
  slideId: string;
  manifestId: string;
  effectIds: readonly string[];
  reviewRequired: boolean;
}

export function createAgentPlanOutputSchema(
  requiredSlideIds: readonly string[],
  animationFacts: readonly AgentAnimationFacts[] = [],
) {
  return AgentPlanOutputSchema.superRefine((output, context) => {
    const expected = new Set(requiredSlideIds);
    const actual = new Set(output.slides.map((slide) => slide.slideId));
    const missing = [...expected].filter((slideId) => !actual.has(slideId));
    const extra = [...actual].filter((slideId) => !expected.has(slideId));
    if (actual.size !== output.slides.length) {
      context.addIssue({ code: "custom", path: ["slides"], message: "Agent 页面计划不能重复" });
    }
    if (missing.length || extra.length) {
      context.addIssue({
        code: "custom",
        path: ["slides"],
        message: `Agent 页面覆盖不一致；missing=${missing.join(",")};extra=${extra.join(",")}`,
      });
    }
    const factsBySlide = new Map(animationFacts.map((facts) => [facts.slideId, facts]));
    const missingFactSlides = [...expected].filter((slideId) => !factsBySlide.has(slideId));
    const extraFactSlides = [...factsBySlide.keys()].filter((slideId) => !expected.has(slideId));
    if (
      animationFacts.length &&
      (factsBySlide.size !== animationFacts.length ||
        missingFactSlides.length > 0 ||
        extraFactSlides.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["slides"],
        message: "权威动画事实必须与页面集合一一对应",
      });
    }
    output.slides.forEach((slide, index) => {
      const facts = factsBySlide.get(slide.slideId);
      if (!facts) return;
      if (slide.animationUnderstanding.manifestId !== facts.manifestId) {
        context.addIssue({
          code: "custom",
          path: ["slides", index, "animationUnderstanding", "manifestId"],
          message: "模型不得替换权威动画清单 ID",
        });
      }
      const interpretedIds = slide.animationUnderstanding.interpretations.map(
        (interpretation) => interpretation.effectId,
      );
      if (JSON.stringify(interpretedIds) !== JSON.stringify(facts.effectIds)) {
        context.addIssue({
          code: "custom",
          path: ["slides", index, "animationUnderstanding", "interpretations"],
          message: "模型必须按 COM 原始顺序逐项解释动画，不得新增、遗漏或重排",
        });
      }
      if (facts.reviewRequired && !slide.animationUnderstanding.reviewRequired) {
        context.addIssue({
          code: "custom",
          path: ["slides", index, "animationUnderstanding", "reviewRequired"],
          message: "动画元数据缺失或复杂时必须等待人工审核",
        });
      }
    });
  });
}

export const PlanTaskCreateRequestSchema = z
  .object({
    presentationId: PresentationIdSchema,
    idempotencyKey: z.string().min(8).max(128),
    audience: z.string().min(1).max(200),
    style: z.string().min(1).max(500),
    targetMinutes: z.number().int().min(1).max(180),
  })
  .strict();

export const PlanTaskResponseSchema = z.object({ data: TaskSchema, meta: ApiMetaSchema }).strict();

export const LessonPlanRevisionEditRequestSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    teachingGoal: z.string().min(1).max(5_000),
    narration: z.array(NarrationSegmentSchema).min(1).max(200),
    derivation: z.array(DerivationStepSchema).max(100),
    scenes: z.array(SceneSchema).min(1).max(100),
    preservationMode: PreservationModeSchema,
    estimatedDurationMs: z.number().int().min(1_500),
  })
  .strict();

export const LessonPlanApprovalRequestSchema = z
  .object({ expectedRevision: z.number().int().min(1) })
  .strict();

export const LessonPlanRevisionResponseSchema = z
  .object({ data: LessonPlanRevisionSchema, meta: ApiMetaSchema })
  .strict();

export const LessonPlanRevisionListResponseSchema = z
  .object({ data: z.array(LessonPlanRevisionSchema), meta: ApiMetaSchema })
  .strict();

export type AgentPlanOutput = z.infer<typeof AgentPlanOutputSchema>;
export type AgentSlidePlan = z.infer<typeof AgentSlidePlanSchema>;
export type PlanTaskCreateRequest = z.infer<typeof PlanTaskCreateRequestSchema>;
export type LessonPlanRevisionEditRequest = z.infer<typeof LessonPlanRevisionEditRequestSchema>;
