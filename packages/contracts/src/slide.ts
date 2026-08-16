import { z } from "zod";

import {
  BoundsSchema,
  IsoDateTimeSchema,
  PresentationIdSchema,
  ProjectIdSchema,
  SlideIdSchema,
  StableIdSchema,
} from "./primitives";
import { PreservationModeSchema } from "./scene";
import { ReviewFlagSchema } from "./review";

export const FormulaStatusSchema = z.enum(["valid", "warning", "error"]);
export type FormulaStatus = z.infer<typeof FormulaStatusSchema>;

export const FormulaSchema = z
  .object({
    id: StableIdSchema,
    latex: z.string().min(1).max(10_000),
    spokenText: z.string().min(1).max(10_000),
    status: FormulaStatusSchema,
    message: z.string().max(1_000).optional(),
  })
  .strict();

export const SlideRegionSchema = z
  .object({
    id: StableIdSchema,
    bounds: BoundsSchema,
    label: z.string().min(1).max(120),
  })
  .strict();

export const SlideSchema = z
  .object({
    id: SlideIdSchema,
    projectId: ProjectIdSchema,
    presentationId: PresentationIdSchema,
    slideNumber: z.number().int().min(1).max(100),
    title: z.string().min(1).max(500),
    summary: z.string().min(1).max(5_000),
    extractedText: z.string().max(50_000),
    teachingScript: z.string().min(1).max(20_000),
    displayText: z.string().min(1).max(20_000).optional(),
    spokenText: z.string().min(1).max(20_000).optional(),
    thumbnailUrl: z.string().min(1).optional(),
    originalPageUrl: z.string().regex(/^\/api\/t\/assets\/[A-Za-z0-9_-]+\/preview$/).optional(),
    sourceAssetId: StableIdSchema,
    renderAssetId: StableIdSchema.optional(),
    formulas: z.array(FormulaSchema).max(100),
    criticalRegions: z.array(SlideRegionSchema).max(100),
    safeRegions: z.array(SlideRegionSchema).max(100),
    parseConfidence: z.number().min(0).max(1),
    parseWarnings: z.array(z.string().max(500)).max(100),
    reviewFlags: z.array(ReviewFlagSchema).max(10).default([]),
    isSkipped: z.boolean(),
    skipReason: z.string().max(1_000).optional(),
    revision: z.number().int().min(1),
    lessonPlanRevisionId: StableIdSchema.optional(),
    lessonPlanRevision: z.number().int().min(1).optional(),
    lessonPlanApproval: z.enum(["pending", "approved"]).optional(),
    preservationMode: PreservationModeSchema.optional(),
    derivationSteps: z.array(z.string().min(1).max(10_000)).max(100).default([]),
    sceneCount: z.number().int().min(0).max(100).default(0),
    isLocked: z.boolean().default(false),
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((slide, context) => {
    if (slide.isSkipped && !slide.skipReason) {
      context.addIssue({
        code: "custom",
        path: ["skipReason"],
        message: "跳过页面必须记录原因",
      });
    }
    if (!slide.isSkipped && slide.skipReason) {
      context.addIssue({
        code: "custom",
        path: ["skipReason"],
        message: "未跳过页面不能携带跳过原因",
      });
    }
  });

export type Formula = z.infer<typeof FormulaSchema>;
export type ParsedSlide = z.infer<typeof SlideSchema>;
