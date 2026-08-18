import type {
  ProviderKind,
  ProviderProtocol,
} from "@ppt-digital-human/contracts";
import { AnthropicProvider } from "./anthropic.ts";
import { DeepSeekProvider } from "./deepseek.ts";
import { GlmProvider } from "./glm.ts";
import { KimiProvider } from "./kimi.ts";
import { OpenAiProvider } from "./openai.ts";
import { ProviderError, providerErrorFromStatus } from "./errors.ts";

export interface ProviderHttpConfig {
  kind: ProviderKind;
  protocol: ProviderProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface ProviderCompletion {
  content: string;
  provider: ProviderKind;
  model: string;
}

export interface ProviderCompletionInput {
  systemPrompt: string;
  userPayload: unknown;
  signal: AbortSignal;
  maxTokens?: number;
}

export interface LlmProvider {
  complete(input: ProviderCompletionInput): Promise<ProviderCompletion>;
}

export function createProvider(config: ProviderHttpConfig): LlmProvider {
  const expectedProtocol = config.kind === "ANTHROPIC" ? "ANTHROPIC_MESSAGES" : "OPENAI_CHAT";
  if (config.protocol !== expectedProtocol) {
    throw new ProviderError("PROVIDER_REQUEST_REJECTED", false, "Provider 类型与协议不匹配。");
  }
  if (config.kind === "OPENAI") return new OpenAiProvider(config);
  if (config.kind === "DEEPSEEK") return new DeepSeekProvider(config);
  if (config.kind === "GLM") return new GlmProvider(config);
  if (config.kind === "KIMI") return new KimiProvider(config);
  return new AnthropicProvider(config);
}

export async function postProviderJson(
  config: ProviderHttpConfig,
  path: string,
  headers: Record<string, string>,
  payload: unknown,
  inputSignal: AbortSignal,
): Promise<unknown> {
  const endpoint = new URL(path, ensureTrailingSlash(config.baseUrl));
  const timeoutMs = config.timeoutMs ?? 30_000;
  const signalState = createTimeoutSignal(inputSignal, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: signalState.signal,
      });
    } catch (error: unknown) {
      if (inputSignal.aborted) throw error;
      if (signalState.timedOut()) {
        throw new ProviderError("PROVIDER_TIMEOUT", true, "Provider 请求超时。");
      }
      throw new ProviderError("PROVIDER_CONNECTION_FAILED", true, "Provider 服务连接失败。");
    }
    if (!response.ok) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      throw providerErrorFromStatus(response.status);
    }
    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderError("PROVIDER_RESPONSE_INVALID", true, "Provider 响应不是合法 JSON。");
    }
  } finally {
    signalState.cleanup();
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function createTimeoutSignal(inputSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(inputSignal.reason);
  inputSignal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      inputSignal.removeEventListener("abort", onAbort);
    },
  };
}
