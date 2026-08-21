import { OpenAiChatProvider } from "./openai.ts";
import type { ProviderHttpConfig } from "./provider.ts";

export class DoubaoProvider extends OpenAiChatProvider {
  constructor(config: ProviderHttpConfig) {
    super({ ...config, kind: "DOUBAO", protocol: "OPENAI_CHAT" });
  }
}
