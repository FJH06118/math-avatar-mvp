import { z } from "zod";

import { BoundsSchema, SceneIdSchema, SlideIdSchema, StableIdSchema } from "./primitives";

const OverlayBaseSchema = z
  .object({
    id: StableIdSchema,
    slideId: SlideIdSchema,
  })
  .strict();

export const HighlightBoxOverlaySchema = OverlayBaseSchema.extend({
  type: z.literal("highlightBox"),
  bounds: BoundsSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();

export const ArrowOverlaySchema = OverlayBaseSchema.extend({
  type: z.literal("arrow"),
  from: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .strict(),
  to: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .strict(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();

export const FormulaOverlaySchema = OverlayBaseSchema.extend({
  type: z.literal("formula"),
  bounds: BoundsSchema,
  latex: z.string().min(1).max(10_000),
}).strict();

export const CalloutOverlaySchema = OverlayBaseSchema.extend({
  type: z.literal("callout"),
  bounds: BoundsSchema,
  text: z.string().min(1).max(1_000),
}).strict();

export const OverlaySchema = z.discriminatedUnion("type", [
  HighlightBoxOverlaySchema,
  ArrowOverlaySchema,
  FormulaOverlaySchema,
  CalloutOverlaySchema,
]);

export const SceneOverlaySchema = z
  .object({
    sceneId: SceneIdSchema,
    overlays: z.array(OverlaySchema).max(1),
  })
  .strict();

export type Overlay = z.infer<typeof OverlaySchema>;
