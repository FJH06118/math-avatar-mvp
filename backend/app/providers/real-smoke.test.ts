import assert from "node:assert/strict";
import { test } from "node:test";
import { OpenAiCompatibleAgentAdapter, type AgentProviderConfig } from "../agent-adapter.ts";

const enabled = process.env.PPT_DH_PROVIDER_SMOKE === "1";

for (const kind of ["OPENAI", "DEEPSEEK", "GLM", "KIMI", "ANTHROPIC"] as const) {
  const config = readSmokeConfig(kind);
  const skipReason = !enabled
    ? "opt-in only: set PPT_DH_PROVIDER_SMOKE=1"
    : config === null
      ? `missing PPT_DH_SMOKE_${kind}_API_KEY, _BASE_URL, or _MODEL`
      : undefined;
  test(`opt-in real smoke: ${kind}`, { skip: skipReason }, async () => {
    assert(config);
    const result = await new OpenAiCompatibleAgentAdapter(config).run({
      slides: [{
        id: "smoke_slide_1",
        title: "导数",
        slideType: "concept",
        extractedText: "导数描述函数的瞬时变化率。",
        notes: "",
        formulas: [],
      }],
      audience: "大学一年级学生",
      style: "严谨、保守",
      targetMinutes: 1,
      signal: new AbortController().signal,
    });
    assert.equal(result.output.slides.length, 1);
    assert.equal(result.output.slides[0]?.slideId, "smoke_slide_1");
  });
}

function readSmokeConfig(kind: "OPENAI" | "DEEPSEEK" | "GLM" | "KIMI" | "ANTHROPIC"): AgentProviderConfig | null {
  const apiKey = process.env[`PPT_DH_SMOKE_${kind}_API_KEY`]?.trim();
  const baseUrl = process.env[`PPT_DH_SMOKE_${kind}_BASE_URL`]?.trim();
  const model = process.env[`PPT_DH_SMOKE_${kind}_MODEL`]?.trim();
  if (!apiKey || !baseUrl || !model) return null;
  return {
    apiKey,
    baseUrl,
    model,
    kind,
    protocol: kind === "ANTHROPIC" ? "ANTHROPIC_MESSAGES" : "OPENAI_CHAT",
    timeoutMs: 60_000,
  };
}
