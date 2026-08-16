import { z } from "zod";
import { ApiMetaSchema } from "./api";
import { AssetIdSchema, PresentationIdSchema, RevisionIdSchema, Sha256Schema, SlideIdSchema, StableIdSchema, TaskIdSchema } from "./primitives";
import { TaskSchema } from "./task";

export const RenderFpsSchema = z.union([z.literal(25), z.literal(30)]);

export const RenderTaskCreateRequestSchema = z.object({
  presentationId: PresentationIdSchema,
  audioTaskId: TaskIdSchema,
  idempotencyKey: z.string().min(8).max(128),
  fps: RenderFpsSchema,
}).strict();

export const RenderTaskResponseSchema = z.object({ data: TaskSchema, meta: ApiMetaSchema }).strict();

export const RenderedPageSchema = z.object({
  id: StableIdSchema,
  taskId: TaskIdSchema,
  slideId: SlideIdSchema,
  revisionId: RevisionIdSchema,
  pageOrder: z.number().int().min(1),
  durationMs: z.number().int().min(1_500),
  fps: RenderFpsSchema,
  width: z.literal(1920),
  height: z.literal(1080),
  frameAssetId: AssetIdSchema,
  videoAssetId: AssetIdSchema,
  frameSha256: Sha256Schema,
  videoSha256: Sha256Schema,
  avatarPlacement: z.enum(["right-panel", "hidden"]),
  overlayType: z.enum(["highlightBox", "arrow"]).optional(),
}).strict();

export const RenderedPageListResponseSchema = z.object({
  data: z.array(RenderedPageSchema).min(1),
  meta: ApiMetaSchema,
}).strict();

export type RenderTaskCreateRequest = z.infer<typeof RenderTaskCreateRequestSchema>;
export type RenderedPage = z.infer<typeof RenderedPageSchema>;
