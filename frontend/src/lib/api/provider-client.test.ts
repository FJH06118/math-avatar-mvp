import { describe, expect, it } from "vitest";

import { hasReadyDefaultProvider } from "./provider-client";

const settings = {
  revision: 1,
  defaultProviderId: "provider_test",
  providers: [{
    id: "provider_test",
    displayName: "DeepSeek",
    kind: "DEEPSEEK" as const,
    protocol: "OPENAI_CHAT" as const,
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    enabled: true,
    isDefault: true,
    capabilities: ["CHAT" as const],
    version: 1,
    keyConfigured: true,
    keyLast4: "test",
    keyVersion: 1,
    lastTestAt: null,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  }],
  updatedAt: "2026-08-18T00:00:00.000Z",
};

describe("Provider upload guard", () => {
  it("requires the default Provider to have passed the multimodal vision test", () => {
    expect(hasReadyDefaultProvider(settings)).toBe(false);
    expect(hasReadyDefaultProvider({
      ...settings,
      providers: [{
        ...settings.providers[0],
        lastTestAt: "2026-08-18T00:01:00.000Z",
      }],
    })).toBe(false);
    expect(hasReadyDefaultProvider({
      ...settings,
      providers: [{
        ...settings.providers[0],
        capabilities: ["CHAT" as const, "VISION" as const],
        lastTestAt: "2026-08-18T00:01:00.000Z",
      }],
    })).toBe(true);
  });
});
