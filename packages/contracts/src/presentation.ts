import { z } from "zod";

import {
  FileNameSchema,
  IsoDateTimeSchema,
  NonNegativeIntSchema,
  PresentationIdSchema,
  ProjectIdSchema,
  Sha256Schema,
  StableIdSchema,
} from "./primitives";

export const PresentationParseStatusSchema = z.enum([
  "pending",
  "parsing",
  "completed",
  "failed",
]);

export const PresentationSchema = z
  .object({
    id: PresentationIdSchema,
    projectId: ProjectIdSchema,
    sourceAssetId: StableIdSchema,
    originalFileName: FileNameSchema,
    sha256: Sha256Schema,
    fileSize: NonNegativeIntSchema,
    mimeType: z.enum([
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ]),
    slideCount: z.number().int().min(0).max(100),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    aspectRatio: z.number().positive().optional(),
    parseStatus: PresentationParseStatusSchema,
    parserVersion: z.string().min(1).max(64),
    revision: z.number().int().min(1),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((presentation, context) => {
    if (presentation.parseStatus !== "completed") {
      return;
    }
    if (presentation.slideCount < 1) {
      context.addIssue({
        code: "custom",
        path: ["slideCount"],
        message: "解析完成的课件必须至少包含一页",
      });
    }
    for (const field of ["width", "height", "aspectRatio"] as const) {
      if (presentation[field] === undefined) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "解析完成后必须记录页面尺寸",
        });
      }
    }
  });

export type Presentation = z.infer<typeof PresentationSchema>;
