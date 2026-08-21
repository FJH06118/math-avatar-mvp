import { OpenAiChatProvider } from "./openai.ts";
import type { ProviderHttpConfig } from "./provider.ts";

export class QwenProvider extends OpenAiChatProvider {
  constructor(config: ProviderHttpConfig) {
    super({ ...config, kind: "QWEN", protocol: "OPENAI_CHAT" });
  }
}
