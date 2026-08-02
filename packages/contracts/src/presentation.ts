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
    mimeType: z.literal(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ),
    slideCount: z.number().int().min(1).max(100),
    width: z.number().positive(),
    height: z.number().positive(),
    aspectRatio: z.number().positive(),
    parseStatus: PresentationParseStatusSchema,
    parserVersion: z.string().min(1).max(64),
    revision: z.number().int().min(1),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export type Presentation = z.infer<typeof PresentationSchema>;
