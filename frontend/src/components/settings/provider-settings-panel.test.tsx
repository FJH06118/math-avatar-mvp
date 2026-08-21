import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProviderSettingsPanel } from "./provider-settings-panel";

const {
  getApplicationSettings,
  testProviderProfile,
} = vi.hoisted(() => ({
  getApplicationSettings: vi.fn(),
  testProviderProfile: vi.fn(),
}));

vi.mock("@/lib/api/provider-client", () => ({
  createProviderProfile: vi.fn(),
  getApplicationSettings,
  setDefaultProvider: vi.fn(),
  testProviderProfile,
  updateProviderProfile: vi.fn(),
}));

describe("ProviderSettingsPanel", () => {
  it("lists Chinese multimodal providers and explains a failed vision probe", async () => {
    getApplicationSettings.mockResolvedValue({
      revision: 1,
      defaultProviderId: "provider_test",
      providers: [{
        id: "provider_test",
        displayName: "DeepSeek",
        kind: "DEEPSEEK",
        protocol: "OPENAI_CHAT",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        enabled: true,
        isDefault: true,
        capabilities: ["CHAT", "STRUCTURED_OUTPUT"],
        version: 1,
        keyConfigured: true,
        keyLast4: "test",
        keyVersion: 1,
        lastTestAt: null,
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
      }],
      updatedAt: "2026-08-18T00:00:00.000Z",
    });
    testProviderProfile.mockResolvedValue({
      profileId: "provider_test",
      status: "FAILED",
      latencyMs: null,
      model: "deepseek-chat",
      capabilities: ["CHAT", "STRUCTURED_OUTPUT"],
      testedAt: "2026-08-18T00:00:00.000Z",
      errorCode: "PROVIDER_VISION_UNSUPPORTED",
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ProviderSettingsPanel />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("listitem"));
    expect(screen.getByRole("option", { name: "豆包 / 火山方舟" })).toBeDefined();
    expect(screen.getByRole("option", { name: "通义千问 / 百炼" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "连接测试" }));
    await waitFor(() => expect(testProviderProfile).toHaveBeenCalledWith("provider_test", 1));
    expect(await screen.findByText(/模型未接受图片输入，请改用支持视觉的多模态模型/)).toBeDefined();
    expect(screen.getByText(/Provider 可能产生极少量用量/)).toBeDefined();
  });
});
