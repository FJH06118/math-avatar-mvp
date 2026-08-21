import type { ProviderKind } from "@ppt-digital-human/contracts";
import { readOpenAiContent } from "./structured-output.ts";
import { postProviderJson, type LlmProvider, type ProviderCompletion, type ProviderCompletionInput, type ProviderHttpConfig } from "./provider.ts";

export class OpenAiChatProvider implements LlmProvider {
  constructor(protected readonly config: ProviderHttpConfig) {}

  async complete(input: ProviderCompletionInput): Promise<ProviderCompletion> {
    const serializedPayload = JSON.stringify(input.userPayload);
    const userContent = input.images?.length
      ? [
          { type: "text", text: serializedPayload },
          ...input.images.flatMap((image) => [
            { type: "text", text: `图像引用：${image.ref}` },
            {
              type: "image_url",
              image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
            },
          ]),
        ]
      : serializedPayload;
    const payload = {
      model: this.config.model,
      temperature: 0.2,
      ...(this.config.capabilities === undefined || this.config.capabilities.includes("STRUCTURED_OUTPUT")
        ? { response_format: { type: "json_object" } }
        : {}),
      ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }),
      ...(this.config.kind === "DEEPSEEK" ? { extra_body: { thinking: { type: "disabled" } } } : {}),
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: userContent },
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
