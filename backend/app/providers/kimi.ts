import { OpenAiChatProvider } from "./openai.ts";
import type { ProviderHttpConfig } from "./provider.ts";

export class KimiProvider extends OpenAiChatProvider {
  constructor(config: ProviderHttpConfig) {
    super({ ...config, kind: "KIMI", protocol: "OPENAI_CHAT" });
  }
}
