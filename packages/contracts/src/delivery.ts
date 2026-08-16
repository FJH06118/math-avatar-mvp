import { z } from "zod";
import { ApiMetaSchema } from "./api";
import { AssetIdSchema, ProjectIdSchema, StableIdSchema, TaskIdSchema } from "./primitives";

export const DeliveryFileSchema = z.object({
  kind: z.enum(["video", "captions", "metadata"]),
  assetId: AssetIdSchema.nullable(),
  fileName: z.string().min(1).max(160),
  mimeType: z.string().min(1).max(160),
  fileSize: z.number().int().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  downloadUrl: z.string().regex(/^\/api\/t\//),
}).strict();

export const DeliveryMetadataSchema = z.object({
  schemaVersion: z.literal("stage-tg-delivery-v1"),
  projectId: ProjectIdSchema,
  presentationId: StableIdSchema,
  taskId: TaskIdSchema,
  title: z.string().min(1).max(200),
  originalFileName: z.string().min(1).max(255),
  slideCount: z.number().int().min(1),
  totalDurationMs: z.number().int().min(1),
  fps: z.union([z.literal(25), z.literal(30)]),
  validationStatus: z.literal("passed"),
}).strict();

export const DeliveryManifestSchema = z.object({
  taskId: TaskIdSchema,
  metadata: DeliveryMetadataSchema,
  files: z.array(DeliveryFileSchema).length(3),
}).strict().superRefine((value, context) => {
  const kinds = new Set(value.files.map((file) => file.kind));
  if (kinds.size !== 3) context.addIssue({ code: "custom", message: "交付清单必须包含视频、字幕和元数据" });
});

export const DeliveryManifestResponseSchema = z.object({ data: DeliveryManifestSchema, meta: ApiMetaSchema }).strict();
export type DeliveryMetadata = z.infer<typeof DeliveryMetadataSchema>;
export type DeliveryManifest = z.infer<typeof DeliveryManifestSchema>;
