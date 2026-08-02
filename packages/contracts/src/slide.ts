import { z } from "zod";

import {
  BoundsSchema,
  IsoDateTimeSchema,
  PresentationIdSchema,
  ProjectIdSchema,
  SlideIdSchema,
  StableIdSchema,
} from "./primitives";

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
    thumbnailUrl: z.string().min(1).optional(),
    sourceAssetId: StableIdSchema,
    renderAssetId: StableIdSchema.optional(),
    formulas: z.array(FormulaSchema).max(100),
    criticalRegions: z.array(SlideRegionSchema).max(100),
    safeRegions: z.array(SlideRegionSchema).max(100),
    parseConfidence: z.number().min(0).max(1),
    parseWarnings: z.array(z.string().max(500)).max(100),
    isSkipped: z.boolean(),
    skipReason: z.string().max(1_000).optional(),
    revision: z.number().int().min(1),
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
