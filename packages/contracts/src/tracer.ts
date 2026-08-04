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

export const TracerUploadMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    fileName: FileNameSchema.refine(
      (value) => /\.pptx?$/i.test(value),
      "仅接受 .ppt 或 .pptx",
    ),
    mimeType: PresentationUploadMimeTypeSchema,
    fileSize: z.number().int().positive().max(100 * 1024 * 1024),
    idempotencyKey: StableIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const expected = value.fileName.toLowerCase().endsWith(".pptx")
      ? PptxMimeTypeSchema.value
      : LegacyPptMimeTypeSchema.value;
    if (value.mimeType !== expected) {
      context.addIssue({
        code: "custom",
        path: ["mimeType"],
        message: "文件扩展名与 MIME 不一致",
      });
    }
  });

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
