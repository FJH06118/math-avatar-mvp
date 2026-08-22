import { ProviderError } from "./errors.ts";
import { parseAndValidateAgentContent } from "../agent-evaluator.ts";
import type { AgentAnimationFacts } from "@ppt-digital-human/contracts";

export function readOpenAiContent(value: unknown): string {
  if (!value || typeof value !== "object") throw invalidResponse();
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") throw invalidResponse();
  const message = (choices[0] as { message?: unknown }).message;
  const content = message && typeof message === "object" ? (message as { content?: unknown }).content : undefined;
  if (typeof content !== "string" || !content.trim()) throw invalidResponse();
  return content;
}

export function readAnthropicContent(value: unknown): string {
  if (!value || typeof value !== "object") throw invalidResponse();
  const blocks = (value as { content?: unknown }).content;
  if (!Array.isArray(blocks)) throw invalidResponse();
  const text = blocks
    .filter((block): block is { type?: unknown; text?: unknown } => Boolean(block) && typeof block === "object")
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .trim();
  if (!text) throw invalidResponse();
  return text;
}

export function validateAgentOutput(
  content: string,
  slideIds: readonly string[],
  animationFacts: readonly AgentAnimationFacts[] = [],
) {
  try {
    return parseAndValidateAgentContent(content, slideIds, animationFacts);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    throw new ProviderError("PROVIDER_OUTPUT_INVALID", false, `Provider 输出未通过严格契约：${detail}`);
  }
}

function invalidResponse(): ProviderError {
  return new ProviderError("PROVIDER_RESPONSE_INVALID", true, "Provider 响应结构无效。");
}
