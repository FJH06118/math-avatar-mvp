import type { ProviderKind } from "@ppt-digital-human/contracts";
import { readOpenAiContent } from "./structured-output.ts";
import { postProviderJson, type LlmProvider, type ProviderCompletion, type ProviderCompletionInput, type ProviderHttpConfig } from "./provider.ts";

export class OpenAiChatProvider implements LlmProvider {
  constructor(protected readonly config: ProviderHttpConfig) {}

  async complete(input: ProviderCompletionInput): Promise<ProviderCompletion> {
    const payload = {
      model: this.config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }),
      ...(this.config.kind === "DEEPSEEK" ? { extra_body: { thinking: { type: "disabled" } } } : {}),
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: JSON.stringify(input.userPayload) },
      ],
    };
    const envelope = await postProviderJson(
      this.config,
      "chat/completions",
      { authorization: `Bearer ${this.config.apiKey}` },
      payload,
      input.signal,
    );
    return {
      content: readOpenAiContent(envelope),
      provider: this.config.kind,
      model: this.config.model,
    };
  }
}

export class OpenAiProvider extends OpenAiChatProvider {
  constructor(config: ProviderHttpConfig) {
    super({ ...config, kind: "OPENAI", protocol: "OPENAI_CHAT" });
  }
}

export function isOpenAiCompatible(kind: ProviderKind): boolean {
  return kind !== "ANTHROPIC";
}
