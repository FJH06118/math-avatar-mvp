import {
  orderedAnimationEffectIds,
  type AnimationTeachingUnderstanding,
  type AnimationManifestV1,
  type SlideAnimationManifest,
} from "@ppt-digital-human/contracts";
import type { AgentInputSlide } from "./agent-adapter.ts";

export const TEST_ANIMATION_MANIFEST_ID = "animation_manifest_test";

export function staticAnimationManifestFixture(
  sourceFileSha256: string,
  slideCount: number,
  extractedAt = "2026-08-22T00:00:00.000Z",
): AnimationManifestV1 {
  const warning = {
    code: "ANIMATION_METADATA_UNAVAILABLE" as const,
    message: "测试课件没有可用动画元数据。",
  };
  return {
    schemaVersion: "animation-manifest-v1",
    id: TEST_ANIMATION_MANIFEST_ID,
    metadataSource: "STATIC_FALLBACK",
    parserVersion: "static-animation-fallback-v1",
    sourceFileSha256,
    extractedAt,
    slideCount,
    slides: Array.from({ length: slideCount }, (_, index) => staticAnimationFixture(index + 1)),
    supportAssessment: {
      levels: ["STATIC_FALLBACK"],
      summary: "测试课件按静态原页处理。",
    },
    warnings: [warning],
  };
}

export function staticAnimationFixture(slideNumber = 1): SlideAnimationManifest {
  const warning = {
    code: "ANIMATION_METADATA_UNAVAILABLE" as const,
    message: "测试课件没有可用动画元数据。",
  };
  return {
    id: `slide_animation_test_${slideNumber}`,
    slideNumber,
    sequences: [],
    transition: null,
    effectCount: 0,
    supportAssessment: {
      levels: ["STATIC_FALLBACK"],
      summary: "测试课件按静态原页处理。",
    },
    warnings: [warning],
  };
}

export function staticAnimationInput(slideNumber = 1) {
  return {
    animationManifestId: TEST_ANIMATION_MANIFEST_ID,
    animationMetadataSource: "STATIC_FALLBACK" as const,
    animation: staticAnimationFixture(slideNumber),
  };
}

export function metadataAnimationInput(slideNumber: number, effectId: string) {
  const animation: SlideAnimationManifest = {
    id: `slide_animation_metadata_${slideNumber}`,
    slideNumber,
    sequences: [{
      id: `sequence_metadata_${slideNumber}`,
      kind: "MAIN",
      index: 1,
      effects: [{
        id: effectId,
        index: 1,
        order: 1,
        effectType: { rawValue: 10, name: "msoAnimEffectFade", known: true },
        category: "ENTRANCE",
        exit: false,
        exitRawValue: 0,
        shape: {
          id: `shape_metadata_${slideNumber}`,
          sourceShapeId: slideNumber,
          name: `第${slideNumber}页答案对象`,
          shapeTypeRaw: 17,
          boundsPoints: { left: 100, top: 100, width: 300, height: 80 },
          visibleBounds: { x: 0.1, y: 0.1, width: 0.3, height: 0.15 },
        },
        paragraph: 0,
        textRangeStart: 0,
        textRangeLength: 4,
        timing: {
          trigger: {
            type: { rawValue: 1, name: "msoAnimTriggerOnPageClick", known: true },
            shape: null,
          },
          triggerDelaySeconds: 0.1,
          durationSeconds: 0.5,
          repeatCount: 1,
          repeatDurationSeconds: 0,
          autoReverse: false,
          autoReverseRawValue: 0,
        },
        supportAssessment: {
          levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
          summary: "测试淡入效果属于简单重建白名单。",
        },
        warnings: [],
      }],
      supportAssessment: {
        levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
        summary: "测试主序列可读取。",
      },
      warnings: [],
    }],
    transition: null,
    effectCount: 1,
    supportAssessment: {
      levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
      summary: "测试页面动画可读取。",
    },
    warnings: [],
  };
  return {
    animationManifestId: TEST_ANIMATION_MANIFEST_ID,
    animationMetadataSource: "POWERPOINT_COM" as const,
    animation,
  };
}

export function animationUnderstandingFixture(
  slide: Pick<AgentInputSlide, "animationManifestId" | "animationMetadataSource" | "animation">,
): AnimationTeachingUnderstanding {
  const effectIds = orderedAnimationEffectIds(slide.animation);
  const reviewRequired =
    slide.animationMetadataSource === "STATIC_FALLBACK" ||
    slide.animation.supportAssessment.levels.includes("UNSUPPORTED_REQUIRES_REVIEW");
  return {
    manifestId: slide.animationManifestId,
    interpretations: effectIds.map((effectId) => ({
      effectId,
      teachingRole: reviewRequired ? "UNKNOWN_REQUIRES_REVIEW" : "EMPHASIS",
      rationale: "测试输出保守解释该动画效果。",
      narrationSync: {
        relation: "NO_SYNC_RECOMMENDED",
        narrationSegmentIndex: null,
        note: "测试输出不改变权威动画计时。",
      },
      confidence: reviewRequired ? "LOW" : "MEDIUM",
      reviewRequired,
    })),
    summary: effectIds.length ? "动画效果需要人工审核。" : "该页没有可解释的权威动画效果。",
    reviewRequired,
    reviewNotes: reviewRequired ? ["动画元数据不可用或包含复杂效果。"] : [],
  };
}
