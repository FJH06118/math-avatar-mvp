import { readAnthropicContent } from "./structured-output.ts";
import { postProviderJson, type LlmProvider, type ProviderCompletion, type ProviderCompletionInput, type ProviderHttpConfig } from "./provider.ts";

export class AnthropicProvider implements LlmProvider {
  constructor(private readonly config: ProviderHttpConfig) {}

  async complete(input: ProviderCompletionInput): Promise<ProviderCompletion> {
    const serializedPayload = JSON.stringify(input.userPayload);
    const userContent = input.images?.length
      ? [
          { type: "text", text: serializedPayload },
          ...input.images.flatMap((image) => [
            { type: "text", text: `图像引用：${image.ref}` },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mimeType,
                data: image.base64,
              },
            },
          ]),
        ]
      : serializedPayload;
    const envelope = await postProviderJson(
      this.config,
      "messages",
      {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      {
        model: this.config.model,
        max_tokens: input.maxTokens ?? 4_096,
        temperature: 0.2,
        system: input.systemPrompt,
        messages: [{ role: "user", content: userContent }],
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
