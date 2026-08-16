import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import type { ProviderKind, ProviderProtocol, ProviderSelectionSnapshot } from "@ppt-digital-human/contracts";
import {
  DatabaseProviderResolver,
  OpenAiCompatibleAgentAdapter,
  ProviderGatewayAgentAdapter,
  type AgentAdapterInput,
} from "../agent-adapter.ts";
import { InMemorySecretClient } from "../secret-client.ts";
import { ProviderError } from "./errors.ts";
import { createProvider, type ProviderHttpConfig } from "./provider.ts";

const providerCases = [
  { kind: "OPENAI", protocol: "OPENAI_CHAT", path: "chat/completions", header: "authorization", value: "Bearer test-key" },
  { kind: "DEEPSEEK", protocol: "OPENAI_CHAT", path: "chat/completions", header: "authorization", value: "Bearer test-key" },
  { kind: "GLM", protocol: "OPENAI_CHAT", path: "chat/completions", header: "authorization", value: "Bearer test-key" },
  { kind: "KIMI", protocol: "OPENAI_CHAT", path: "chat/completions", header: "authorization", value: "Bearer test-key" },
  { kind: "ANTHROPIC", protocol: "ANTHROPIC_MESSAGES", path: "messages", header: "x-api-key", value: "test-key" },
] as const;

for (const providerCase of providerCases) {
  test(`${providerCase.kind} adapter sends the expected local HTTP request`, async () => {
    let requestPath = "";
    let requestHeader = "";
    let requestBody: Record<string, unknown> | undefined;
    const fixture = await startFixtureServer(async (request, response) => {
      requestPath = request.url ?? "";
      requestHeader = request.headers[providerCase.header] as string;
      requestBody = JSON.parse(await readBody(request)) as Record<string, unknown>;
      response.end(JSON.stringify(envelopeFor(providerCase.kind, validPlanJson())));
    });
    try {
      const result = await createProvider(configFor(providerCase, fixture.baseUrl)).complete({
        systemPrompt: "system",
        userPayload: { slideId: "slide_1" },
        signal: new AbortController().signal,
      });
      assert.equal(result.provider, providerCase.kind);
      assert.equal(result.model, "fixture-model");
      assert.equal(result.content, validPlanJson());
      assert.equal(requestPath, `/v1/${providerCase.path}`);
      assert.equal(requestHeader, providerCase.value);
      assert.equal(requestBody?.model, "fixture-model");
      if (providerCase.kind === "ANTHROPIC") {
        assert.equal(requestBody?.max_tokens, 4_096);
      } else {
        assert.deepEqual(requestBody?.response_format, { type: "json_object" });
      }
    } finally {
      await fixture.close();
    }
  });
}

for (const providerCase of providerCases) {
  for (const status of [401, 403, 429, 500] as const) {
    test(`${providerCase.kind} classifies HTTP ${status} without exposing upstream text`, async () => {
      const fixture = await startFixtureServer(async (_request, response) => {
        response.statusCode = status;
        response.end(`secret-upstream-detail-${status}`);
      });
      try {
        await assert.rejects(
          createProvider(configFor(providerCase, fixture.baseUrl)).complete({
            systemPrompt: "system",
            userPayload: {},
            signal: new AbortController().signal,
          }),
          (error: unknown) => {
            assert(error instanceof ProviderError);
            assert.equal(error.code, status === 401 || status === 403 ? "PROVIDER_AUTH_FAILED" : status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UPSTREAM_FAILED");
            assert(!error.message.includes("secret-upstream-detail"));
            assert.equal(error.retryable, status === 429 || status === 500);
            return true;
          },
        );
      } finally {
        await fixture.close();
      }
    });
  }
}

for (const providerCase of providerCases) {
  test(`${providerCase.kind} classifies truncated JSON and response shape failures`, async () => {
    const fixture = await startFixtureServer(async (request, response) => {
      await readBody(request);
      response.setHeader("content-type", "application/json");
      response.end('{"choices":');
    });
    try {
      await assert.rejects(
        createProvider(configFor(providerCase, fixture.baseUrl)).complete({
          systemPrompt: "system",
          userPayload: {},
          signal: new AbortController().signal,
        }),
        (error: unknown) => error instanceof ProviderError && error.code === "PROVIDER_RESPONSE_INVALID" && error.retryable,
      );
    } finally {
      await fixture.close();
    }
  });
}

for (const providerCase of providerCases) {
  test(`${providerCase.kind} gateway performs one bounded repair and rejects invalid Contract output`, async () => {
    let mode: "fenced" | "invalid" = "fenced";
    const fixture = await startFixtureServer(async (request, response) => {
      await readBody(request);
      response.end(JSON.stringify(envelopeFor(providerCase.kind, mode === "fenced" ? `\`\`\`json\n${validPlanJson()}\n\`\`\`` : JSON.stringify({ schemaVersion: "stage-tc-agent-v1", slides: [] }))));
    });
    try {
      const adapter = new OpenAiCompatibleAgentAdapter({
        apiKey: "test-key",
        baseUrl: fixture.baseUrl,
        model: "fixture-model",
        kind: providerCase.kind,
        protocol: providerCase.protocol,
      });
      const repaired = await adapter.run(adapterInput());
      assert.equal(repaired.validationAttempts, 2);
      assert.equal(repaired.output.slides[0]?.slideId, "slide_1");

      mode = "invalid";
      await assert.rejects(
        adapter.run(adapterInput()),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "AGENT_OUTPUT_INVALID" && !error.message.includes("test-key"),
      );
    } finally {
      await fixture.close();
    }
  });
}

test("ProviderGatewayAgentAdapter resolves the frozen profile and selected secret version", async () => {
  let authorization = "";
  const fixture = await startFixtureServer(async (request, response) => {
    authorization = String(request.headers.authorization ?? "");
    await readBody(request);
    response.end(JSON.stringify(envelopeFor("DEEPSEEK", validPlanJson())));
  });
  const secretClient = new InMemorySecretClient();
  const secret = await secretClient.put("credential_provider_fixture", "resolver-key-v1");
  const profile = {
    id: "provider_fixture",
    principal: "principal_fixture",
    kind: "DEEPSEEK",
    protocol: "OPENAI_CHAT",
    baseUrl: fixture.baseUrl,
    model: "fixture-model",
    enabled: true,
    version: 1,
    keyConfigured: true,
    keyVersion: secret.keyVersion,
    credentialRef: "credential_provider_fixture",
  };
  const prisma = {
    providerProfile: {
      findFirst: async () => profile,
    },
  } as never;
  const resolver = new DatabaseProviderResolver(prisma, secretClient);
  const selection: ProviderSelectionSnapshot = {
    profileId: profile.id,
    kind: "DEEPSEEK",
    protocol: "OPENAI_CHAT",
    baseUrl: fixture.baseUrl,
    model: profile.model,
    profileVersion: 1,
    keyVersion: secret.keyVersion,
    promptVersion: "stage-tc-agent-prompt-v1",
  };
  try {
    const result = await new ProviderGatewayAgentAdapter(resolver).run({
      ...adapterInput(),
      principal: profile.principal,
      providerSelection: selection,
    });
    assert.equal(result.provider, "DEEPSEEK");
    assert.equal(authorization, "Bearer resolver-key-v1");

    await assert.rejects(
      new ProviderGatewayAgentAdapter(resolver).run({
        ...adapterInput(),
        principal: profile.principal,
        providerSelection: { ...selection, profileVersion: 2 },
      }),
      (error: unknown) => error instanceof Error && "code" in error && "retryable" in error && error.code === "AGENT_CONFIG_MISSING" && error.retryable === false,
    );
  } finally {
    await fixture.close();
  }
});

test("Provider adapters classify a timeout as retryable", async () => {
  const fixture = await startFixtureServer(async (request, response) => {
    await readBody(request);
    await new Promise((resolve) => setTimeout(resolve, 50));
    response.end(JSON.stringify(envelopeFor("OPENAI", validPlanJson())));
  });
  try {
    await assert.rejects(
      createProvider({
        kind: "OPENAI",
        protocol: "OPENAI_CHAT",
        baseUrl: fixture.baseUrl,
        model: "fixture-model",
        apiKey: "test-key",
        timeoutMs: 10,
      }).complete({ systemPrompt: "system", userPayload: {}, signal: new AbortController().signal }),
      (error: unknown) => error instanceof ProviderError && error.code === "PROVIDER_TIMEOUT" && error.retryable,
    );
  } finally {
    await fixture.close();
  }
});

function configFor(providerCase: typeof providerCases[number], baseUrl: string, timeoutMs?: number): ProviderHttpConfig {
  return {
    kind: providerCase.kind,
    protocol: providerCase.protocol,
    baseUrl,
    model: "fixture-model",
    apiKey: "test-key",
    timeoutMs,
  };
}

function adapterInput(): AgentAdapterInput {
  return {
    slides: [{ id: "slide_1", title: "导数", slideType: "concept", extractedText: "导数定义", notes: "", formulas: [] }],
    audience: "大学一年级",
    style: "严谨",
    targetMinutes: 3,
    signal: new AbortController().signal,
  };
}

function validPlanJson(): string {
  return JSON.stringify({
    schemaVersion: "stage-tc-agent-v1",
    slides: [{
      slideId: "slide_1",
      teachingGoal: "理解导数定义",
      narration: [{ displayText: "导数描述瞬时变化率。", spokenText: "导数描述瞬时变化率。" }],
      derivation: [],
      scenes: [{ durationMs: 2_000 }],
      preservationMode: "FULL_PRESERVE",
    }],
  });
}

function envelopeFor(kind: ProviderKind, content: string): Record<string, unknown> {
  return kind === "ANTHROPIC"
    ? { content: [{ type: "text", text: content }] }
    : { choices: [{ message: { content } }] };
}

async function startFixtureServer(handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>) {
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
