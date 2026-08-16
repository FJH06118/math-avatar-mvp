import { z } from "zod";

import { createApiSuccessSchema } from "./api";
import { HttpUrlSchema, IsoDateTimeSchema, PositiveIntSchema, StableIdSchema } from "./primitives";

export const ProviderKindSchema = z.enum([
  "OPENAI",
  "DEEPSEEK",
  "GLM",
  "KIMI",
  "ANTHROPIC",
]);

export const ProviderProtocolSchema = z.enum(["OPENAI_CHAT", "ANTHROPIC_MESSAGES"]);

export const ProviderCapabilitySchema = z.enum([
  "CHAT",
  "STRUCTURED_OUTPUT",
  "STREAMING",
  "VISION",
]);

export const ProviderBaseUrlSchema = HttpUrlSchema.superRefine((value, context) => {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    context.addIssue({
      code: "custom",
      message: "Provider 地址不能包含用户名、密码、查询参数或片段",
    });
  }
});

export const ProviderApiKeySchema = z
  .string()
  .min(8, "API Key 过短")
  .max(512, "API Key 过长")
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "API Key 不能包含控制字符");

const KeyLast4Schema = z.string().max(4).regex(/^[^\r\n]*$/);

export const ProviderProfileSchema = z
  .object({
    id: StableIdSchema,
    displayName: z.string().min(1).max(100),
    kind: ProviderKindSchema,
    protocol: ProviderProtocolSchema,
    baseUrl: ProviderBaseUrlSchema,
    model: z.string().min(1).max(200),
    enabled: z.boolean(),
    isDefault: z.boolean(),
    capabilities: z.array(ProviderCapabilitySchema).max(20),
    version: PositiveIntSchema,
    keyConfigured: z.boolean(),
    keyLast4: KeyLast4Schema.nullable(),
    keyVersion: z.number().int().min(0),
    lastTestAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

const ProviderProfileFields = {
  displayName: z.string().min(1).max(100),
  kind: ProviderKindSchema,
  protocol: ProviderProtocolSchema,
  baseUrl: ProviderBaseUrlSchema,
  model: z.string().min(1).max(200),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  apiKey: ProviderApiKeySchema.optional(),
} as const;

function refineProtocol(
  value: { kind: z.infer<typeof ProviderKindSchema>; protocol: z.infer<typeof ProviderProtocolSchema> },
  context: z.RefinementCtx,
): void {
  const expected = value.kind === "ANTHROPIC" ? "ANTHROPIC_MESSAGES" : "OPENAI_CHAT";
  if (value.protocol !== expected) {
    context.addIssue({
      code: "custom",
      path: ["protocol"],
      message: `${value.kind} 必须使用 ${expected} 协议`,
    });
  }
}

export const ProviderProfileCreateInputSchema = z
  .object(ProviderProfileFields)
  .strict()
  .superRefine(refineProtocol);

export const ProviderProfileUpdateInputSchema = z
  .object({
    expectedVersion: PositiveIntSchema,
    displayName: ProviderProfileFields.displayName.optional(),
    kind: ProviderProfileFields.kind.optional(),
    protocol: ProviderProfileFields.protocol.optional(),
    baseUrl: ProviderProfileFields.baseUrl.optional(),
    model: ProviderProfileFields.model.optional(),
    enabled: ProviderProfileFields.enabled.optional(),
    isDefault: ProviderProfileFields.isDefault.optional(),
    apiKey: ProviderProfileFields.apiKey,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), {
    message: "至少需要一个可更新字段",
  });

export const ProviderProfileSetDefaultInputSchema = z
  .object({ expectedVersion: PositiveIntSchema })
  .strict();

export const ProviderProfileDeleteInputSchema = z
  .object({ expectedVersion: PositiveIntSchema })
  .strict();

export const ProviderTestRequestSchema = z
  .object({ expectedVersion: PositiveIntSchema })
  .strict();

export const ProviderTestResultSchema = z
  .object({
    profileId: StableIdSchema,
    status: z.enum(["CONFIGURED", "FAILED"]),
    latencyMs: z.number().int().min(0).nullable(),
    model: z.string().min(1).max(200),
    capabilities: z.array(ProviderCapabilitySchema).max(20),
    testedAt: IsoDateTimeSchema,
    errorCode: z
      .enum(["CREDENTIAL_NOT_CONFIGURED", "SECRET_STORE_UNAVAILABLE", "PROFILE_DISABLED"])
      .nullable(),
  })
  .strict();

export const ProviderSelectionSnapshotSchema = z
  .object({
    profileId: StableIdSchema,
    kind: ProviderKindSchema,
    protocol: ProviderProtocolSchema,
    baseUrl: ProviderBaseUrlSchema,
    model: z.string().min(1).max(200),
    profileVersion: PositiveIntSchema,
    keyVersion: z.number().int().min(0),
    promptVersion: z.string().min(1).max(100),
  })
  .strict();

export const ProviderProfileResponseSchema = createApiSuccessSchema(ProviderProfileSchema);
export const ProviderProfileListResponseSchema = createApiSuccessSchema(ProviderProfileSchema.array());
export const ProviderTestResponseSchema = createApiSuccessSchema(ProviderTestResultSchema);

export type ProviderKind = z.infer<typeof ProviderKindSchema>;
export type ProviderProtocol = z.infer<typeof ProviderProtocolSchema>;
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;
export type ProviderProfile = z.infer<typeof ProviderProfileSchema>;
export type ProviderProfileCreateInput = z.infer<typeof ProviderProfileCreateInputSchema>;
export type ProviderProfileUpdateInput = z.infer<typeof ProviderProfileUpdateInputSchema>;
export type ProviderProfileSetDefaultInput = z.infer<typeof ProviderProfileSetDefaultInputSchema>;
export type ProviderProfileDeleteInput = z.infer<typeof ProviderProfileDeleteInputSchema>;
export type ProviderTestRequest = z.infer<typeof ProviderTestRequestSchema>;
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;
export type ProviderSelectionSnapshot = z.infer<typeof ProviderSelectionSnapshotSchema>;
