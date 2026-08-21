import { randomInt } from "node:crypto";
import type {
  ProviderCapability,
  ProviderKind,
  ProviderProtocol,
} from "@ppt-digital-human/contracts";
import sharp from "sharp";
import { createProvider } from "./providers/provider.ts";
import { ProviderError } from "./providers/errors.ts";

export interface ProviderConnectionTestInput {
  kind: ProviderKind;
  protocol: ProviderProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
  capabilities: ProviderCapability[];
}

export interface ProviderConnectionTestResult {
  capabilities: ProviderCapability[];
}

export interface ProviderConnectionTester {
  test(input: ProviderConnectionTestInput): Promise<ProviderConnectionTestResult>;
}

const VISION_PROBES = [
  { dominantColor: "RED", background: "#ff0000" },
  { dominantColor: "GREEN", background: "#00ff00" },
  { dominantColor: "BLUE", background: "#0000ff" },
] as const;

export class RealProviderConnectionTester implements ProviderConnectionTester {
  constructor(
    private readonly chooseProbeIndex: () => number = () => randomInt(VISION_PROBES.length),
  ) {}

  async test(input: ProviderConnectionTestInput): Promise<ProviderConnectionTestResult> {
    const selectedProbe = VISION_PROBES[this.chooseProbeIndex()];
    if (!selectedProbe) {
      throw new ProviderError("PROVIDER_RESPONSE_INVALID", false, "Provider 视觉探针配置无效。");
    }
    const probe = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: selectedProbe.background,
      },
    }).png().toBuffer();
    try {
      const completion = await createProvider({ ...input, timeoutMs: 15_000 }).complete({
        systemPrompt: "你正在执行受控视觉能力探针。观察附图，只返回 JSON：{\"ok\":true,\"dominantColor\":\"RED|GREEN|BLUE\"}。dominantColor 必须是图片主色对应的英文枚举，不输出 Markdown 或其他文字。",
        userPayload: {
          operation: "multimodal_connection_test",
          instruction: "识别附图主色并按系统规定的 JSON 契约回答。",
          imageRef: "vision-probe",
        },
        images: [{
          ref: "vision-probe",
          mimeType: "image/png",
          base64: probe.toString("base64"),
        }],
        signal: new AbortController().signal,
        maxTokens: 32,
      });
      assertVisionProbeResult(completion.content, selectedProbe.dominantColor);
    } catch (error: unknown) {
      if (error instanceof ProviderError && error.code === "PROVIDER_REQUEST_REJECTED") {
        throw new ProviderError(
          "PROVIDER_VISION_UNSUPPORTED",
          false,
          "所选模型未接受图片输入，请改用支持视觉的模型并检查 API 地址。",
        );
      }
      if (error instanceof ProviderError && error.code === "PROVIDER_VISION_UNSUPPORTED") {
        throw error;
      }
      throw error;
    }
    return {
      capabilities: [...new Set([...input.capabilities, "VISION" as const])],
    };
  }
}

function assertVisionProbeResult(content: string, expectedColor: string): void {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  let value: unknown;
  try {
    value = JSON.parse(candidate) as unknown;
  } catch {
    throw visionNotVerified();
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { ok?: unknown }).ok !== true ||
    typeof (value as { dominantColor?: unknown }).dominantColor !== "string" ||
    (value as { dominantColor: string }).dominantColor.trim().toUpperCase() !== expectedColor
  ) {
    throw visionNotVerified();
  }
}

function visionNotVerified(): ProviderError {
  return new ProviderError(
    "PROVIDER_VISION_UNSUPPORTED",
    false,
    "模型未能正确识别随机视觉探针，请改用支持图片输入的多模态模型。",
  );
}
