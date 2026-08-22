import { describe, expect, it } from "vitest";

import {
  AnimationManifestV1Schema,
  orderedAnimationEffectIds,
  type AnimationManifestV1,
} from "./animation";

const shape = {
  id: `shape_${"1".repeat(64)}`,
  sourceShapeId: 7,
  name: "答案文本",
  shapeTypeRaw: 17,
  boundsPoints: { left: 72, top: 144, width: 360, height: 90 },
  visibleBounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.125 },
};

const effect = {
  id: `effect_${"2".repeat(64)}`,
  index: 1,
  order: 1,
  effectType: { rawValue: 10, name: "msoAnimEffectFade", known: true },
  category: "ENTRANCE" as const,
  exit: false,
  exitRawValue: 0,
  shape,
  paragraph: 0,
  textRangeStart: 0,
  textRangeLength: 4,
  timing: {
    trigger: {
      type: { rawValue: 1, name: "msoAnimTriggerOnPageClick", known: true },
      shape: null,
    },
    triggerDelaySeconds: 0.2,
    durationSeconds: 0.75,
    repeatCount: 1,
    repeatDurationSeconds: 0,
    autoReverse: false,
    autoReverseRawValue: 0,
  },
  supportAssessment: {
    levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"] as const,
    summary: "淡入效果属于首阶段重建白名单。",
  },
  warnings: [],
};

const manifest: AnimationManifestV1 = {
  schemaVersion: "animation-manifest-v1",
  id: `animation_manifest_${"3".repeat(64)}`,
  metadataSource: "POWERPOINT_COM",
  parserVersion: "powerpoint-com-animation-v1",
  sourceFileSha256: "4".repeat(64),
  extractedAt: "2026-08-22T00:00:00Z",
  slideCount: 1,
  slides: [{
    id: `slide_animation_${"5".repeat(64)}`,
    slideNumber: 1,
    sequences: [{
      id: `sequence_${"6".repeat(64)}`,
      kind: "MAIN",
      index: 1,
      effects: [effect],
      supportAssessment: {
        levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
        summary: "主序列可读取，简单效果可重建。",
      },
      warnings: [],
    }],
    transition: {
      entryEffect: { rawValue: 1793, name: "ppEffectFade", known: true },
      durationSeconds: 1,
      advanceOnClick: true,
      advanceOnClickRawValue: -1,
      advanceOnTime: true,
      advanceOnTimeRawValue: -1,
      advanceTimeSeconds: 4,
      morphDetected: false,
      supportAssessment: {
        levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
        summary: "淡入页面切换属于重建白名单。",
      },
      warnings: [],
    },
    effectCount: 1,
    supportAssessment: {
      levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
      summary: "页面动画元数据完整。",
    },
    warnings: [],
  }],
  supportAssessment: {
    levels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
    summary: "演示文稿动画元数据完整。",
  },
  warnings: [],
};

describe("PowerPoint animation contracts", () => {
  it("accepts authoritative ordered COM metadata and stable references", () => {
    const parsed = AnimationManifestV1Schema.parse(manifest);
    expect(orderedAnimationEffectIds(parsed.slides[0])).toEqual([effect.id]);
    expect(parsed.slides[0].transition?.advanceTimeSeconds).toBe(4);
  });

  it("preserves unknown raw enums with an explicit review warning", () => {
    const candidate = structuredClone(manifest);
    const unknown = candidate.slides[0].sequences[0].effects[0];
    unknown.effectType = { rawValue: 99_999, name: "UNKNOWN_99999", known: false };
    unknown.category = "CUSTOM_OR_UNKNOWN";
    unknown.supportAssessment = {
      levels: ["METADATA_SUPPORTED", "PRESERVE_NATIVE_RECOMMENDED", "UNSUPPORTED_REQUIRES_REVIEW"],
      summary: "未知效果必须保留原生播放并人工审核。",
    };
    unknown.warnings = [{
      code: "UNKNOWN_ANIMATION_EFFECT",
      message: "PowerPoint 返回了当前解析器未知的效果枚举。",
      effectId: unknown.id,
      rawValue: 99_999,
    }];
    expect(AnimationManifestV1Schema.parse(candidate).slides[0].sequences[0].effects[0].effectType.rawValue).toBe(99_999);
  });

  it("accepts a legal static fallback but rejects invented fallback facts", () => {
    const fallback = structuredClone(manifest);
    fallback.metadataSource = "STATIC_FALLBACK";
    fallback.parserVersion = "static-animation-fallback-v1";
    fallback.supportAssessment = { levels: ["STATIC_FALLBACK"], summary: "当前环境只能静态处理。" };
    fallback.warnings = [{ code: "ANIMATION_METADATA_UNAVAILABLE", message: "当前环境无法读取 PowerPoint 动画元数据。" }];
    fallback.slides[0].sequences = [];
    fallback.slides[0].transition = null;
    fallback.slides[0].effectCount = 0;
    fallback.slides[0].supportAssessment = { levels: ["STATIC_FALLBACK"], summary: "该页只能静态处理。" };
    fallback.slides[0].warnings = fallback.warnings;
    expect(AnimationManifestV1Schema.safeParse(fallback).success).toBe(true);
    fallback.slides[0].transition = manifest.slides[0].transition;
    expect(AnimationManifestV1Schema.safeParse(fallback).success).toBe(false);
  });

  it("rejects sequence reordering, duplicate IDs, and unknown fields", () => {
    const reordered = structuredClone(manifest);
    reordered.slides[0].sequences[0].effects[0].order = 2;
    expect(AnimationManifestV1Schema.safeParse(reordered).success).toBe(false);
    expect(AnimationManifestV1Schema.safeParse({ ...manifest, diskPath: "C:\\private.pptx" }).success).toBe(false);
    const duplicateAcrossSequences = structuredClone(manifest);
    duplicateAcrossSequences.slides[0].sequences.push({
      ...structuredClone(duplicateAcrossSequences.slides[0].sequences[0]),
      id: `sequence_${"7".repeat(64)}`,
      kind: "INTERACTIVE",
      index: 1,
    });
    duplicateAcrossSequences.slides[0].effectCount = 2;
    expect(AnimationManifestV1Schema.safeParse(duplicateAcrossSequences).success).toBe(false);
  });
});
