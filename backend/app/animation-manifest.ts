import { createHash } from "node:crypto";
import {
  AnimationManifestV1Schema,
  orderedAnimationEffectIds,
  type AgentAnimationFacts,
  type AnimationManifestV1,
  type SlideAnimationManifest,
} from "@ppt-digital-human/contracts";
import { WorkerError } from "./worker-error.ts";

interface PresentationAnimationSource {
  sha256: string;
  createdAt: Date;
  animationManifestJson: unknown;
  slides: Array<{ id: string; slideNumber: number }>;
}

export function readPresentationAnimationManifest(
  presentation: PresentationAnimationSource,
): AnimationManifestV1 {
  if (presentation.animationManifestJson === null) {
    return createLegacyStaticFallback(
      presentation.sha256,
      presentation.slides.length,
      presentation.createdAt,
    );
  }
  const parsed = AnimationManifestV1Schema.safeParse(presentation.animationManifestJson);
  if (
    !parsed.success ||
    parsed.data.sourceFileSha256 !== presentation.sha256 ||
    parsed.data.slideCount !== presentation.slides.length
  ) {
    throw new WorkerError(
      "ANIMATION_MANIFEST_INVALID",
      "动画清单未通过严格契约或与当前课件修订不一致。",
      false,
    );
  }
  return parsed.data;
}

export function animationFactsForSlides(
  manifest: AnimationManifestV1,
  slides: Array<{ id: string; slideNumber: number }>,
): AgentAnimationFacts[] {
  return slides.map((slide) => {
    const animation = animationForSlide(manifest, slide.slideNumber);
    const levels = animation.supportAssessment.levels;
    return {
      slideId: slide.id,
      manifestId: manifest.id,
      effectIds: orderedAnimationEffectIds(animation),
      reviewRequired:
        manifest.metadataSource === "STATIC_FALLBACK" ||
        levels.includes("UNSUPPORTED_REQUIRES_REVIEW"),
    };
  });
}

export function animationForSlide(
  manifest: AnimationManifestV1,
  slideNumber: number,
): SlideAnimationManifest {
  const animation = manifest.slides[slideNumber - 1];
  if (!animation || animation.slideNumber !== slideNumber) {
    throw new WorkerError(
      "ANIMATION_MANIFEST_INVALID",
      "动画清单页面对应关系无效。",
      false,
    );
  }
  return animation;
}

function createLegacyStaticFallback(
  sourceFileSha256: string,
  slideCount: number,
  extractedAt: Date,
): AnimationManifestV1 {
  const rootWarning = {
    code: "ANIMATION_METADATA_UNAVAILABLE" as const,
    message: "该课件由旧版静态解析结果创建，没有可用的 PowerPoint 动画元数据。",
  };
  return AnimationManifestV1Schema.parse({
    schemaVersion: "animation-manifest-v1",
    id: stableId("animation_manifest", sourceFileSha256, "animation-manifest-v1"),
    metadataSource: "STATIC_FALLBACK",
    parserVersion: "legacy-static-animation-fallback-v1",
    sourceFileSha256,
    extractedAt: extractedAt.toISOString(),
    slideCount,
    slides: Array.from({ length: slideCount }, (_, index) => ({
      id: stableId("slide_animation", sourceFileSha256, index + 1),
      slideNumber: index + 1,
      sequences: [],
      transition: null,
      effectCount: 0,
      supportAssessment: {
        levels: ["STATIC_FALLBACK"],
        summary: "该页没有权威动画元数据，只能按静态原页处理。",
      },
      warnings: [rootWarning],
    })),
    supportAssessment: {
      levels: ["STATIC_FALLBACK"],
      summary: "旧解析结果只能静态处理，不能声明动画已经识别。",
    },
    warnings: [rootWarning],
  });
}

function stableId(prefix: string, ...parts: Array<string | number>): string {
  return `${prefix}_${createHash("sha256").update(parts.join("\x1f")).digest("hex")}`;
}
