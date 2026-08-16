import { z } from "zod";

import { createApiSuccessSchema } from "./api";
import { IsoDateTimeSchema, StableIdSchema } from "./primitives";
import { ProviderProfileSchema } from "./provider";

export const ApplicationSettingsSchema = z
  .object({
    revision: z.number().int().min(1),
    defaultProviderId: StableIdSchema.nullable(),
    providers: z.array(ProviderProfileSchema).max(20),
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const ApplicationSettingsResponseSchema = createApiSuccessSchema(
  ApplicationSettingsSchema,
);

export type ApplicationSettings = z.infer<typeof ApplicationSettingsSchema>;
