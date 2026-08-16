import { z } from "zod";

import { OverlaySchema } from "./overlays";
import {
  AssetIdSchema,
  SceneIdSchema,
  SlideIdSchema,
} from "./primitives";

export const PreservationModeSchema = z.enum([
  "FULL_PRESERVE",
  "PRESERVE_WITH_OVERLAY",
  "LOCAL_REBUILD",
  "FULL_REDESIGN",
]);

export const BaseSlideSchema = z
  .object({
    sourceAssetId: AssetIdSchema,
    preservationMode: PreservationModeSchema,
    fit: z.literal("contain"),
    mustShowFullSlide: z.boolean(),
    fullSlideDurationMs: z.number().int().min(1_500),
    fullRedesignAuthorizedByUser: z.boolean(),
  })
  .strict()
  .superRefine((baseSlide, context) => {
    if (
      baseSlide.preservationMode === "FULL_REDESIGN" &&
      !baseSlide.fullRedesignAuthorizedByUser
    ) {
      context.addIssue({
        code: "custom",
        path: ["fullRedesignAuthorizedByUser"],
        message: "整页重设计必须有用户明确授权",
      });
    }
    if (!baseSlide.mustShowFullSlide) {
      context.addIssue({
        code: "custom",
        path: ["mustShowFullSlide"],
        message: "未跳过页面必须完整展示原页",
      });
    }
  });

export const SceneSchema = z
  .object({
    id: SceneIdSchema,
    // Stage T uses one source page per scene so coverage proves a full page shot.
    sourceSlides: z.array(SlideIdSchema).length(1),
    baseSlide: BaseSlideSchema,
    durationMs: z.number().int().min(1_500),
    overlay: OverlaySchema.optional(),
    isSkipped: z.boolean(),
  })
  .strict()
  .superRefine((scene, context) => {
    if (!scene.isSkipped && !scene.baseSlide.mustShowFullSlide) {
      context.addIssue({
        code: "custom",
        path: ["baseSlide", "mustShowFullSlide"],
        message: "未跳过场景必须包含完整原页镜头",
      });
    }
    if (scene.overlay && !scene.sourceSlides.includes(scene.overlay.slideId)) {
      context.addIssue({
        code: "custom",
        path: ["overlay", "slideId"],
        message: "Overlay 必须关联场景来源页面",
      });
    }
  });

export type BaseSlide = z.infer<typeof BaseSlideSchema>;
export type Scene = z.infer<typeof SceneSchema>;

export function deriveSourceSlideCoverage(
  scenes: readonly Scene[],
): string[] {
  const covered = new Set<string>();
  for (const scene of scenes) {
    if (scene.isSkipped) {
      continue;
    }
    for (const slideId of scene.sourceSlides) {
      covered.add(slideId);
    }
  }
  return [...covered];
}

export function expectedSourceSlideCoverageSchema(
  requiredSlideIds: readonly string[],
) {
  return z.array(SlideIdSchema).superRefine((coverage, context) => {
    const expected = new Set(requiredSlideIds);
    const actual = new Set(coverage);
    const missing = [...expected].filter((slideId) => !actual.has(slideId));
    const extra = [...actual].filter((slideId) => !expected.has(slideId));
    const hasDuplicates = actual.size !== coverage.length;
    if (missing.length > 0) {
      context.addIssue({
        code: "custom",
        message: `缺少完整原页覆盖: ${missing.join(", ")}`,
      });
    }
    if (extra.length > 0) {
      context.addIssue({
        code: "custom",
        message: `包含不属于当前演示文稿的页面: ${extra.join(", ")}`,
      });
    }
    if (hasDuplicates) {
      context.addIssue({
        code: "custom",
        message: "页面覆盖不能重复登记",
      });
    }
  });
}
