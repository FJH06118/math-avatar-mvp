import { z } from "zod";

import {
  AssetIdSchema,
  HttpUrlSchema,
  IsoDateTimeSchema,
  NonNegativeIntSchema,
  ProjectIdSchema,
  Sha256Schema,
  SlideIdSchema,
  StableIdSchema,
} from "./primitives";

export const AssetKindSchema = z.enum([
  "SOURCE_PPT",
  "SLIDE_THUMBNAIL",
  "SLIDE_RENDER",
  "AUDIO",
  "CAPTION",
  "PAGE_VIDEO",
  "FINAL_VIDEO",
  "PROJECT_PACKAGE",
  "VALIDATION_REPORT",
]);

export const PublicAssetRefSchema = z
  .object({
    assetId: AssetIdSchema,
    url: HttpUrlSchema.optional(),
    expiresAt: IsoDateTimeSchema.optional(),
  })
  .strict();

export const AssetSchema = z
  .object({
    assetId: AssetIdSchema,
    projectId: ProjectIdSchema,
    taskId: StableIdSchema.optional(),
    slideId: SlideIdSchema.optional(),
    kind: AssetKindSchema,
    sha256: Sha256Schema,
    mimeType: z.string().min(1).max(160),
    fileSizeBytes: NonNegativeIntSchema,
    durationMs: NonNegativeIntSchema.optional(),
    publicRef: PublicAssetRefSchema.optional(),
    createdAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema.optional(),
  })
  .strict();

export type Asset = z.infer<typeof AssetSchema>;
export type PublicAssetRef = z.infer<typeof PublicAssetRefSchema>;

export const FormulaResolutionSchema = z.literal("1920 × 1080");

export const RenderResultSchema = z
  .object({
    id: StableIdSchema,
    projectId: ProjectIdSchema,
    jobId: StableIdSchema,
    title: z.string().min(1).max(200),
    videoUrl: z.string().min(1).optional(),
    posterUrl: z.string().min(1).optional(),
    captionTrackUrl: z.string().min(1).optional(),
    mp4Url: z.string().min(1).optional(),
    srtUrl: z.string().min(1).optional(),
    durationSeconds: z.number().nonnegative(),
    fileSizeBytes: NonNegativeIntSchema,
    resolution: FormulaResolutionSchema,
    generatedAt: IsoDateTimeSchema,
    assetsAvailable: z.boolean(),
  })
  .strict();

export type RenderResult = z.infer<typeof RenderResultSchema>;
