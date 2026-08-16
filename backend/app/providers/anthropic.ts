import { readAnthropicContent } from "./structured-output.ts";
import { postProviderJson, type LlmProvider, type ProviderCompletion, type ProviderCompletionInput, type ProviderHttpConfig } from "./provider.ts";

export class AnthropicProvider implements LlmProvider {
  constructor(private readonly config: ProviderHttpConfig) {}

  async complete(input: ProviderCompletionInput): Promise<ProviderCompletion> {
    const envelope = await postProviderJson(
      this.config,
      "messages",
      {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      {
        model: this.config.model,
        max_tokens: 4_096,
        temperature: 0.2,
        system: input.systemPrompt,
        messages: [{ role: "user", content: JSON.stringify(input.userPayload) }],
      },
      input.signal,
    );
    return {
      content: readAnthropicContent(envelope),
      provider: "ANTHROPIC",
      model: this.config.model,
    };
  }
}
