import { z } from "zod";

import { Sha256Schema, StableIdSchema } from "./primitives";

const FiniteNumberSchema = z.number().refine(Number.isFinite, "必须是有限数值");
const RawEnumSchema = z
  .object({
    rawValue: z.number().int().nullable(),
    name: z.string().min(1).max(120),
    known: z.boolean(),
  })
  .strict();

export const AnimationMetadataSourceSchema = z.enum([
  "POWERPOINT_COM",
  "STATIC_FALLBACK",
]);

export const AnimationSupportLevelSchema = z.enum([
  "METADATA_SUPPORTED",
  "REBUILD_WHITELIST",
  "PRESERVE_NATIVE_RECOMMENDED",
  "UNSUPPORTED_REQUIRES_REVIEW",
  "STATIC_FALLBACK",
]);

export const AnimationWarningCodeSchema = z.enum([
  "ANIMATION_METADATA_UNAVAILABLE",
  "ANIMATION_METADATA_SLIDE_COUNT_MISMATCH",
  "POWERPOINT_NOT_INSTALLED",
  "POWERPOINT_COM_UNAVAILABLE",
  "POWERPOINT_SECURITY_CONFIGURATION_FAILED",
  "POWERPOINT_FILE_OPEN_FAILED",
  "POWERPOINT_ANIMATION_TIMEOUT",
  "POWERPOINT_ANIMATION_CANCELLED",
  "POWERPOINT_ANIMATION_INVALID",
  "POWERPOINT_ANIMATION_EXTRACTION_FAILED",
  "ANIMATION_STRUCTURE_PARTIAL",
  "UNKNOWN_ANIMATION_EFFECT",
  "CUSTOM_ANIMATION",
  "MORPH_TRANSITION",
  "COMPLEX_MOTION_PATH",
  "MEDIA_TRIGGER_OR_EFFECT",
  "INTERACTIVE_TRIGGER_REQUIRES_REVIEW",
  "UNKNOWN_TRIGGER",
  "UNKNOWN_TRANSITION",
  "REPEAT_OR_AUTO_REVERSE_REQUIRES_REVIEW",
  "NATIVE_PLAYBACK_RECOMMENDED",
]);

export const AnimationWarningSchema = z
  .object({
    code: AnimationWarningCodeSchema,
    message: z.string().min(1).max(500),
    effectId: StableIdSchema.optional(),
    rawValue: z.number().int().optional(),
  })
  .strict();

export const AnimationSupportAssessmentSchema = z
  .object({
    levels: z.array(AnimationSupportLevelSchema).min(1).max(5),
    summary: z.string().min(1).max(1_000),
  })
  .strict()
  .superRefine((assessment, context) => {
    if (new Set(assessment.levels).size !== assessment.levels.length) {
      context.addIssue({ code: "custom", path: ["levels"], message: "支持等级不能重复" });
    }
    const fallback = assessment.levels.includes("STATIC_FALLBACK");
    if (fallback && assessment.levels.length !== 1) {
      context.addIssue({ code: "custom", path: ["levels"], message: "静态降级不能与其他支持等级并存" });
    }
    if (!fallback && !assessment.levels.includes("METADATA_SUPPORTED")) {
      context.addIssue({ code: "custom", path: ["levels"], message: "非静态结果必须声明元数据支持" });
    }
  });

export const AnimationShapeReferenceSchema = z
  .object({
    id: StableIdSchema,
    sourceShapeId: z.number().int().min(1).nullable(),
    name: z.string().min(1).max(500),
    shapeTypeRaw: z.number().int(),
    boundsPoints: z
      .object({
        left: FiniteNumberSchema,
        top: FiniteNumberSchema,
        width: FiniteNumberSchema.nonnegative(),
        height: FiniteNumberSchema.nonnegative(),
      })
      .strict(),
    visibleBounds: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const AnimationTriggerSchema = z
  .object({
    type: RawEnumSchema,
    shape: AnimationShapeReferenceSchema.nullable(),
  })
  .strict();

export const AnimationTimingSchema = z
  .object({
    trigger: AnimationTriggerSchema,
    triggerDelaySeconds: FiniteNumberSchema.nullable(),
    durationSeconds: FiniteNumberSchema.nonnegative().nullable(),
    repeatCount: FiniteNumberSchema.nullable(),
    repeatDurationSeconds: FiniteNumberSchema.nullable(),
    autoReverse: z.boolean().nullable(),
    autoReverseRawValue: z.number().int().nullable(),
  })
  .strict();

export const AnimationEffectCategorySchema = z.enum([
  "ENTRANCE",
  "EMPHASIS",
  "EXIT",
  "MOTION_PATH",
  "MEDIA",
  "CUSTOM_OR_UNKNOWN",
]);

export const AnimationEffectSchema = z
  .object({
    id: StableIdSchema,
    index: z.number().int().min(1).nullable(),
    order: z.number().int().min(1),
    effectType: RawEnumSchema,
    category: AnimationEffectCategorySchema,
    exit: z.boolean().nullable(),
    exitRawValue: z.number().int().nullable(),
    shape: AnimationShapeReferenceSchema.nullable(),
    paragraph: z.number().int().nullable(),
    textRangeStart: z.number().int().nullable(),
    textRangeLength: z.number().int().nullable(),
    timing: AnimationTimingSchema,
    supportAssessment: AnimationSupportAssessmentSchema,
    warnings: z.array(AnimationWarningSchema).max(20),
  })
  .strict();

export const AnimationSequenceSchema = z
  .object({
    id: StableIdSchema,
    kind: z.enum(["MAIN", "INTERACTIVE"]),
    index: z.number().int().min(1),
    effects: z.array(AnimationEffectSchema).max(2_000),
    supportAssessment: AnimationSupportAssessmentSchema,
    warnings: z.array(AnimationWarningSchema).max(100),
  })
  .strict()
  .superRefine((sequence, context) => {
    sequence.effects.forEach((effect, index) => {
      if (effect.order !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["effects", index, "order"],
          message: "动画效果顺序必须连续且从 1 开始",
        });
      }
    });
    if (new Set(sequence.effects.map((effect) => effect.id)).size !== sequence.effects.length) {
      context.addIssue({ code: "custom", path: ["effects"], message: "动画效果业务 ID 不能重复" });
    }
  });

export const SlideTransitionSchema = z
  .object({
    entryEffect: RawEnumSchema,
    durationSeconds: FiniteNumberSchema.nonnegative().nullable(),
    advanceOnClick: z.boolean().nullable(),
    advanceOnClickRawValue: z.number().int().nullable(),
    advanceOnTime: z.boolean().nullable(),
    advanceOnTimeRawValue: z.number().int().nullable(),
    advanceTimeSeconds: FiniteNumberSchema.nonnegative().nullable(),
    morphDetected: z.boolean(),
    supportAssessment: AnimationSupportAssessmentSchema,
    warnings: z.array(AnimationWarningSchema).max(20),
  })
  .strict();

export const SlideAnimationManifestSchema = z
  .object({
    id: StableIdSchema,
    slideNumber: z.number().int().min(1).max(100),
    sequences: z.array(AnimationSequenceSchema).max(1_001),
    transition: SlideTransitionSchema.nullable(),
    effectCount: z.number().int().min(0).max(20_000),
    supportAssessment: AnimationSupportAssessmentSchema,
    warnings: z.array(AnimationWarningSchema).max(200),
  })
  .strict()
  .superRefine((slide, context) => {
    const count = slide.sequences.reduce((total, sequence) => total + sequence.effects.length, 0);
    if (count !== slide.effectCount) {
      context.addIssue({ code: "custom", path: ["effectCount"], message: "动画效果计数与序列不一致" });
    }
    if (new Set(slide.sequences.map((sequence) => sequence.id)).size !== slide.sequences.length) {
      context.addIssue({ code: "custom", path: ["sequences"], message: "动画序列业务 ID 不能重复" });
    }
    const effectIds = slide.sequences.flatMap((sequence) =>
      sequence.effects.map((effect) => effect.id),
    );
    if (new Set(effectIds).size !== effectIds.length) {
      context.addIssue({ code: "custom", path: ["sequences"], message: "同页动画效果业务 ID 不能重复" });
    }
    const mainSequences = slide.sequences.filter((sequence) => sequence.kind === "MAIN");
    if (
      mainSequences.length > 1 ||
      (mainSequences.length === 1 &&
        (mainSequences[0]?.index !== 1 || slide.sequences[0]?.kind !== "MAIN"))
    ) {
      context.addIssue({ code: "custom", path: ["sequences"], message: "主序列必须唯一、索引为 1 且位于交互序列之前" });
    }
    const interactive = slide.sequences.filter((sequence) => sequence.kind === "INTERACTIVE");
    interactive.forEach((sequence, index) => {
      if (sequence.index !== index + 1) {
        context.addIssue({ code: "custom", path: ["sequences"], message: "交互序列索引必须连续且从 1 开始" });
      }
    });
  });

export const AnimationManifestV1Schema = z
  .object({
    schemaVersion: z.literal("animation-manifest-v1"),
    id: StableIdSchema,
    metadataSource: AnimationMetadataSourceSchema,
    parserVersion: z.string().min(1).max(100),
    sourceFileSha256: Sha256Schema,
    extractedAt: z.string().datetime({ offset: true }),
    slideCount: z.number().int().min(1).max(100),
    slides: z.array(SlideAnimationManifestSchema).min(1).max(100),
    supportAssessment: AnimationSupportAssessmentSchema,
    warnings: z.array(AnimationWarningSchema).max(500),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.slides.length !== manifest.slideCount) {
      context.addIssue({ code: "custom", path: ["slideCount"], message: "动画清单页数与页面数组不一致" });
    }
    manifest.slides.forEach((slide, index) => {
      if (slide.slideNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["slides", index, "slideNumber"],
          message: "动画页面必须按连续页码排序",
        });
      }
    });
    if (new Set(manifest.slides.map((slide) => slide.id)).size !== manifest.slides.length) {
      context.addIssue({ code: "custom", path: ["slides"], message: "动画页面业务 ID 不能重复" });
    }
    const fallback = manifest.metadataSource === "STATIC_FALLBACK";
    if (fallback !== manifest.supportAssessment.levels.includes("STATIC_FALLBACK")) {
      context.addIssue({ code: "custom", path: ["supportAssessment"], message: "元数据来源与支持等级不一致" });
    }
    if (fallback) {
      manifest.slides.forEach((slide, index) => {
        if (slide.sequences.length !== 0 || slide.transition !== null) {
          context.addIssue({
            code: "custom",
            path: ["slides", index],
            message: "静态降级不能伪造动画序列或页面切换",
          });
        }
      });
    }
  });

export const AnimationTeachingRoleSchema = z.enum([
  "STEPWISE_DERIVATION",
  "CONDITION_REVEAL",
  "ANSWER_REVEAL",
  "EMPHASIS",
  "NAVIGATION",
  "DECORATIVE",
  "UNKNOWN_REQUIRES_REVIEW",
]);

export const AnimationNarrationSyncSchema = z
  .object({
    relation: z.enum([
      "BEFORE_EFFECT",
      "AT_EFFECT_START",
      "DURING_EFFECT",
      "AFTER_EFFECT",
      "NO_SYNC_RECOMMENDED",
    ]),
    narrationSegmentIndex: z.number().int().min(0).max(199).nullable(),
    note: z.string().min(1).max(1_000),
  })
  .strict();

export const AnimationEffectInterpretationSchema = z
  .object({
    effectId: StableIdSchema,
    teachingRole: AnimationTeachingRoleSchema,
    rationale: z.string().min(1).max(2_000),
    narrationSync: AnimationNarrationSyncSchema,
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    reviewRequired: z.boolean(),
  })
  .strict()
  .superRefine((interpretation, context) => {
    if (interpretation.confidence === "LOW" && !interpretation.reviewRequired) {
      context.addIssue({
        code: "custom",
        path: ["reviewRequired"],
        message: "低置信度动画解释必须进入人工审核",
      });
    }
  });

export const AnimationTeachingUnderstandingSchema = z
  .object({
    manifestId: StableIdSchema,
    interpretations: z.array(AnimationEffectInterpretationSchema).max(20_000),
    summary: z.string().min(1).max(5_000),
    reviewRequired: z.boolean(),
    reviewNotes: z.array(z.string().min(1).max(1_000)).max(100),
  })
  .strict()
  .superRefine((understanding, context) => {
    if (understanding.reviewRequired && understanding.reviewNotes.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["reviewNotes"],
        message: "需要人工审核时必须提供原因",
      });
    }
    if (
      new Set(understanding.interpretations.map((item) => item.effectId)).size !==
      understanding.interpretations.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["interpretations"],
        message: "每个动画效果只能解释一次",
      });
    }
  });

export function orderedAnimationEffectIds(slide: SlideAnimationManifest): string[] {
  return slide.sequences.flatMap((sequence) => sequence.effects.map((effect) => effect.id));
}

export type AnimationManifestV1 = z.infer<typeof AnimationManifestV1Schema>;
export type SlideAnimationManifest = z.infer<typeof SlideAnimationManifestSchema>;
export type SlideTransition = z.infer<typeof SlideTransitionSchema>;
export type AnimationSequence = z.infer<typeof AnimationSequenceSchema>;
export type AnimationEffect = z.infer<typeof AnimationEffectSchema>;
export type AnimationTiming = z.infer<typeof AnimationTimingSchema>;
export type AnimationTrigger = z.infer<typeof AnimationTriggerSchema>;
export type AnimationSupportAssessment = z.infer<typeof AnimationSupportAssessmentSchema>;
export type AnimationTeachingUnderstanding = z.infer<typeof AnimationTeachingUnderstandingSchema>;
