import { OpenAiChatProvider } from "./openai.ts";
import type { ProviderHttpConfig } from "./provider.ts";

export class DeepSeekProvider extends OpenAiChatProvider {
  constructor(config: ProviderHttpConfig) {
    super({ ...config, kind: "DEEPSEEK", protocol: "OPENAI_CHAT" });
  }
}
