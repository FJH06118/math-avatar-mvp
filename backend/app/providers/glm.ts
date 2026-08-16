import { OpenAiChatProvider } from "./openai.ts";
import type { ProviderHttpConfig } from "./provider.ts";

export class GlmProvider extends OpenAiChatProvider {
  constructor(config: ProviderHttpConfig) {
    super({ ...config, kind: "GLM", protocol: "OPENAI_CHAT" });
  }
}
