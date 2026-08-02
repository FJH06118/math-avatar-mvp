import { z } from "zod";

import { HttpUrlSchema, IsoDateTimeSchema, StableIdSchema } from "./primitives";

export const SchemaVersionSchema = z
  .string()
  .regex(/^v\d+$/, "必须使用 vN 形式的契约版本");

export const ApiMetaSchema = z
  .object({
    requestId: StableIdSchema,
    inputVersion: SchemaVersionSchema,
    outputVersion: SchemaVersionSchema,
  })
  .strict();

export const ApiErrorCodeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1).max(2_000),
        retryable: z.boolean(),
        details: z.record(z.string(), z.unknown()),
      })
      .strict(),
    meta: ApiMetaSchema,
  })
  .strict();

export function createApiSuccessSchema<T extends z.ZodType>(data: T) {
  return z
    .object({ data, meta: ApiMetaSchema })
    .strict();
}

export const SignedDownloadSchema = z
  .object({
    assetId: StableIdSchema,
    url: HttpUrlSchema,
    expiresAt: IsoDateTimeSchema,
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type SignedDownload = z.infer<typeof SignedDownloadSchema>;
