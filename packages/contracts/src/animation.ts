import { z } from "zod";

import { ApiMetaSchema } from "./api";
import { PresentationIdSchema, Sha256Schema, StableIdSchema } from "./primitives";

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

export const AnimationSequenceKindSchema = z.enum(["MAIN", "INTERACTIVE"]);

export const AnimationSequenceSchema = z
  .object({
    id: StableIdSchema,
    kind: AnimationSequenceKindSchema,
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

/**
 * 动画处置（M1）：与 COM 动画事实**分离**的一层，记录"这一页的动画最终怎么处理"。
 *
 * - `NOT_APPLICABLE`：该页没有动画，服务端派生；
 * - `ACCEPT_STATIC`：用户明确接受"最终视频不会播放本页动画"；
 * - `PRESERVE_NATIVE`：保留 PowerPoint 原生播放，**M2 判定 GO 之前不得作为可选项**。
 *
 * disposition 与动画清单通过 `manifestHash` 绑定：清单变化（重新解析或替换源课件）后，
 * 旧的处置自动失效，必须重新确认。
 */
export const AnimationDispositionModeSchema = z.enum([
  "NOT_APPLICABLE",
  "ACCEPT_STATIC",
  "PRESERVE_NATIVE",
]);

export const AnimationDispositionSchema = z
  .object({
    schemaVersion: z.literal("animation-disposition-v1"),
    slideId: StableIdSchema,
    manifestHash: Sha256Schema,
    mode: AnimationDispositionModeSchema,
    decidedBy: StableIdSchema,
    decidedAt: z.string().datetime({ offset: true }),
    reason: z.string().min(1).max(1_000).optional(),
  })
  .strict()
  .superRefine((disposition, context) => {
    if (disposition.mode === "NOT_APPLICABLE" && disposition.reason !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "系统派生的处置不接受用户理由",
      });
    }
    if (disposition.mode === "ACCEPT_STATIC" && disposition.reason === undefined) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "接受静态必须记录依据",
      });
    }
  });

/**
 * 面向工作台与结果报告的逐页动画事实投影。
 * 只包含业务数据，不含磁盘路径、storage key、COM 内部对象或上游正文。
 */
export const SlideAnimationReviewSchema = z
  .object({
    slideId: StableIdSchema,
    slideNumber: z.number().int().min(1).max(100),
    manifestHash: Sha256Schema,
    metadataSource: AnimationMetadataSourceSchema,
    effectCount: z.number().int().min(0).max(20_000),
    sequenceKinds: z.array(AnimationSequenceKindSchema).max(100),
    supportLevels: z.array(AnimationSupportLevelSchema).max(20),
    supportSummary: z.string().min(1).max(5_000),
    warnings: z.array(AnimationWarningSchema).max(200),
    /** 该页是否存在权威动画事实（无动画或元数据不可用时为 false）。 */
    hasAnimationFacts: z.boolean(),
    disposition: AnimationDispositionSchema.nullable(),
    /** 当前处置是否仍然对应当前动画清单。 */
    dispositionCurrent: z.boolean(),
  })
  .strict()
  .superRefine((review, context) => {
    if (review.effectCount > 0 && review.sequenceKinds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["sequenceKinds"],
        message: "存在动画效果时必须报告序列类别",
      });
    }
    if (review.disposition !== null && review.disposition.slideId !== review.slideId) {
      context.addIssue({
        code: "custom",
        path: ["disposition"],
        message: "处置必须属于同一页面",
      });
    }
    if (!review.dispositionCurrent && review.disposition !== null) {
      context.addIssue({
        code: "custom",
        path: ["dispositionCurrent"],
        message: "处以失效状态时必须清空处置",
      });
    }
  });

/**
 * 结果报告：只暴露计数，不暴露页码之外的任何内部数据。
 */
export const AnimationDispositionReportSchema = z
  .object({
    animatedSlideCount: z.number().int().min(0).max(100),
    nativePreservedSlideCount: z.number().int().min(0).max(100),
    acceptedStaticSlideCount: z.number().int().min(0).max(100),
    metadataUnavailableSlideCount: z.number().int().min(0).max(100),
  })
  .strict();

/** 工作台/结果页的动画处置总览：逐页事实 + 计数报告 + 当前可选模式。 */
export const AnimationDispositionReviewSchema = z
  .object({
    presentationId: PresentationIdSchema,
    manifestHash: Sha256Schema,
    /** 需要用户处置、当前尚未处置的页面。 */
    pendingSlideIds: z.array(StableIdSchema).max(100),
    selectableModes: z.array(AnimationDispositionModeSchema).max(10),
    report: AnimationDispositionReportSchema,
    slides: z.array(SlideAnimationReviewSchema).max(100),
  })
  .strict();

export const AnimationDispositionReviewResponseSchema = z
  .object({ data: AnimationDispositionReviewSchema, meta: ApiMetaSchema })
  .strict();

export type AnimationDispositionReview = z.infer<typeof AnimationDispositionReviewSchema>;
export type AnimationDisposition = z.infer<typeof AnimationDispositionSchema>;
export type AnimationDispositionMode = z.infer<typeof AnimationDispositionModeSchema>;
export type SlideAnimationReview = z.infer<typeof SlideAnimationReviewSchema>;
export type AnimationDispositionReport = z.infer<typeof AnimationDispositionReportSchema>;

export type AnimationManifestV1 = z.infer<typeof AnimationManifestV1Schema>;
export type SlideAnimationManifest = z.infer<typeof SlideAnimationManifestSchema>;
export type SlideTransition = z.infer<typeof SlideTransitionSchema>;
export type AnimationSequence = z.infer<typeof AnimationSequenceSchema>;
export type AnimationEffect = z.infer<typeof AnimationEffectSchema>;
export type AnimationTiming = z.infer<typeof AnimationTimingSchema>;
export type AnimationTrigger = z.infer<typeof AnimationTriggerSchema>;
export type AnimationSupportAssessment = z.infer<typeof AnimationSupportAssessmentSchema>;
export type AnimationTeachingUnderstanding = z.infer<typeof AnimationTeachingUnderstandingSchema>;
