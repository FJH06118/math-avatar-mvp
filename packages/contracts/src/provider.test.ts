import { describe, expect, it } from "vitest";

import {
  ProviderProfileCreateInputSchema,
  ProviderProfileSchema,
  ProviderProfileUpdateInputSchema,
  ProviderSelectionSnapshotSchema,
  ProviderTestResultSchema,
} from "./provider";

describe("provider contracts", () => {
  it("rejects unknown fields and credential-bearing URLs", () => {
    expect(
      ProviderProfileCreateInputSchema.safeParse({
        displayName: "DeepSeek",
        kind: "DEEPSEEK",
        protocol: "OPENAI_CHAT",
        baseUrl: "https://user:password@example.test/v1",
        model: "deepseek-chat",
        enabled: true,
        isDefault: true,
        apiKey: "sk-test-provider-key",
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("never treats an apiKey as a public profile field", () => {
    const result = ProviderProfileSchema.safeParse({
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
      apiKey: "sk-test-provider-key",
    });
    expect(result.success).toBe(false);
  });

  it("requires a non-empty update and preserves the strict snapshot boundary", () => {
    expect(ProviderProfileUpdateInputSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(
      ProviderSelectionSnapshotSchema.safeParse({
        profileId: "provider_test",
        kind: "DEEPSEEK",
        protocol: "OPENAI_CHAT",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        profileVersion: 2,
        keyVersion: 3,
        promptVersion: "stage-p2-v1",
        apiKey: "sk-test-provider-key",
      }).success,
    ).toBe(false);
  });

  it("distinguishes a real connection result from safe failure categories", () => {
    const base = {
      profileId: "provider_test",
      latencyMs: 42,
      model: "deepseek-chat",
      capabilities: ["CHAT"],
      testedAt: "2026-08-18T00:00:00.000Z",
    };
    expect(ProviderTestResultSchema.safeParse({
      ...base,
      status: "CONNECTED",
      errorCode: null,
    }).success).toBe(true);
    expect(ProviderTestResultSchema.safeParse({
      ...base,
      status: "FAILED",
      latencyMs: null,
      errorCode: "PROVIDER_CONNECTION_FAILED",
    }).success).toBe(true);
    expect(ProviderTestResultSchema.safeParse({
      ...base,
      status: "CONFIGURED",
      errorCode: null,
    }).success).toBe(false);
  });
});
