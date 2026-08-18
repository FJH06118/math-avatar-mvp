import type { ProviderKind, ProviderProtocol } from "@ppt-digital-human/contracts";
import { createProvider } from "./providers/provider.ts";

export interface ProviderConnectionTestInput {
  kind: ProviderKind;
  protocol: ProviderProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ProviderConnectionTester {
  test(input: ProviderConnectionTestInput): Promise<void>;
}

export class RealProviderConnectionTester implements ProviderConnectionTester {
  async test(input: ProviderConnectionTestInput): Promise<void> {
    await createProvider({ ...input, timeoutMs: 15_000 }).complete({
      systemPrompt: "只返回一个简短 JSON 对象，用于验证模型连接。",
      userPayload: { operation: "connection_test", expected: { ok: true } },
      signal: new AbortController().signal,
      maxTokens: 16,
    });
  }
}
