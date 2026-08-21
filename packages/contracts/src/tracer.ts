import { z } from "zod";

import { createApiSuccessSchema } from "./api";
import { FileNameSchema, StableIdSchema } from "./primitives";
import { PresentationSchema } from "./presentation";
import { ProjectSchema } from "./project";
import { TaskSchema } from "./task";

export const PptxMimeTypeSchema = z.literal(
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
);
export const LegacyPptMimeTypeSchema = z.literal("application/vnd.ms-powerpoint");
export const PresentationUploadMimeTypeSchema = z.union([
  PptxMimeTypeSchema,
  LegacyPptMimeTypeSchema,
]);

const GenericBinaryMimeTypes = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);
const PptxMimeTypeAliases = new Set([
  PptxMimeTypeSchema.value,
  "application/zip",
  "application/x-zip-compressed",
]);
const LegacyPptMimeTypeAliases = new Set([
  LegacyPptMimeTypeSchema.value,
  "application/mspowerpoint",
  "application/powerpoint",
  "application/x-mspowerpoint",
]);

function canonicalMimeType(fileName: string) {
  return fileName.toLowerCase().endsWith(".pptx")
    ? PptxMimeTypeSchema.value
    : LegacyPptMimeTypeSchema.value;
}

function acceptsBrowserMimeType(fileName: string, mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (GenericBinaryMimeTypes.has(normalized)) {
    return true;
  }
  return fileName.toLowerCase().endsWith(".pptx")
    ? PptxMimeTypeAliases.has(normalized)
    : LegacyPptMimeTypeAliases.has(normalized);
}

export const TracerUploadMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    fileName: FileNameSchema.refine(
      (value) => /\.pptx?$/i.test(value),
      "仅接受 .ppt 或 .pptx",
    ),
    mimeType: z.string().max(160),
    fileSize: z.number().int().positive().max(100 * 1024 * 1024),
    idempotencyKey: StableIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!acceptsBrowserMimeType(value.fileName, value.mimeType)) {
      context.addIssue({
        code: "custom",
        path: ["mimeType"],
        message: "文件扩展名与 MIME 不一致",
      });
    }
  })
  .transform((value) => ({
    ...value,
    mimeType: canonicalMimeType(value.fileName),
  }));

export const TracerUploadReceiptSchema = z
  .object({
    project: ProjectSchema,
    presentation: PresentationSchema,
    task: TaskSchema,
    created: z.boolean(),
  })
  .strict();

export const TracerUploadResponseSchema = createApiSuccessSchema(
  TracerUploadReceiptSchema,
);
export const TracerTaskResponseSchema = createApiSuccessSchema(TaskSchema);

export type TracerUploadMetadata = z.infer<typeof TracerUploadMetadataSchema>;
export type TracerUploadReceipt = z.infer<typeof TracerUploadReceiptSchema>;
export type TracerUploadResponse = z.infer<typeof TracerUploadResponseSchema>;
