import { z } from "zod";

import { createApiSuccessSchema } from "./api";
import { FileNameSchema, StableIdSchema } from "./primitives";
import { PresentationSchema } from "./presentation";
import { ProjectSchema } from "./project";
import { TaskSchema } from "./task";

export const PptxMimeTypeSchema = z.literal(
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
);

export const TracerUploadMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    fileName: FileNameSchema.refine(
      (value) => value.toLowerCase().endsWith(".pptx"),
      "阶段 T 仅接受 .pptx",
    ),
    mimeType: PptxMimeTypeSchema,
    fileSize: z.number().int().positive().max(100 * 1024 * 1024),
    idempotencyKey: StableIdSchema,
  })
  .strict();

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
