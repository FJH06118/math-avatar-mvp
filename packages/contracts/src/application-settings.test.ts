import { describe, expect, it } from "vitest";

import { ApplicationSettingsSchema } from "./application-settings";

describe("application settings contract", () => {
  it("accepts a redacted provider list", () => {
    const result = ApplicationSettingsSchema.safeParse({
      revision: 1,
      defaultProviderId: "provider_test",
      providers: [
        {
          id: "provider_test",
          displayName: "DeepSeek",
          kind: "DEEPSEEK",
          protocol: "OPENAI_CHAT",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          enabled: true,
          isDefault: true,
          capabilities: ["CHAT"],
          version: 1,
          keyConfigured: true,
          keyLast4: "-key",
          keyVersion: 1,
          lastTestAt: null,
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
        },
      ],
      updatedAt: "2026-08-17T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
