import { z } from "zod";

import { createApiSuccessSchema } from "./api";
import { IsoDateTimeSchema } from "./primitives";

export const RuntimeHealthModeSchema = z.enum(["production", "mock"]);

export const RuntimeHealthStatusSchema = z.enum([
  "READY",
  "WARN",
  "FAILED",
  "NOT_CONFIGURED",
  "UNKNOWN",
]);

export const RuntimeHealthComponentSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
    status: RuntimeHealthStatusSchema,
    message: z.string().min(1).max(500),
    action: z.string().min(1).max(240).nullable(),
    version: z.string().min(1).max(120).nullable(),
    latencyMs: z.number().int().min(0).nullable(),
  })
  .strict();

export const RuntimeHealthSchema = z
  .object({
    mode: RuntimeHealthModeSchema,
    status: RuntimeHealthStatusSchema,
    checkedAt: IsoDateTimeSchema,
    components: z.array(RuntimeHealthComponentSchema).max(64),
  })
  .strict();

export const RuntimeHealthResponseSchema = createApiSuccessSchema(RuntimeHealthSchema);

export const RuntimeDiagnosticSchema = z
  .object({
    schemaVersion: z.literal("runtime-diagnostic-v1"),
    generatedAt: IsoDateTimeSchema,
    health: RuntimeHealthSchema,
  })
  .strict();

export const RuntimeDiagnosticResponseSchema = createApiSuccessSchema(RuntimeDiagnosticSchema);

export type RuntimeHealthMode = z.infer<typeof RuntimeHealthModeSchema>;
export type RuntimeHealthStatus = z.infer<typeof RuntimeHealthStatusSchema>;
export type RuntimeHealthComponent = z.infer<typeof RuntimeHealthComponentSchema>;
export type RuntimeHealth = z.infer<typeof RuntimeHealthSchema>;
export type RuntimeDiagnostic = z.infer<typeof RuntimeDiagnosticSchema>;
