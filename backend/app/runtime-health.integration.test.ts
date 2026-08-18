import "dotenv/config";

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  ApiErrorSchema,
  ProviderProfileResponseSchema,
  RuntimeDiagnosticResponseSchema,
  RuntimeHealthResponseSchema,
} from "@ppt-digital-human/contracts";
import { createApplication } from "./app.ts";
import { clearProductState, createProductPrismaClient } from "./database.ts";
import { InMemorySecretClient } from "./secret-client.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for P6 runtime health tests.");

const prisma = createProductPrismaClient(databaseUrl);
const secretClient = new InMemorySecretClient();
const internalToken = "p6-runtime-health-token";
const principal = "p6-runtime-health-user";
const app = createApplication({
  prisma,
  assetRoot: "",
  internalToken,
  secretClient,
  requireProviderForUpload: true,
  providerConnectionTester: {
    async test(input) {
      assert.equal(input.apiKey, "sk-p6-runtime-health-key");
    },
  },
});

beforeEach(async () => clearProductState(prisma));
after(async () => prisma.$disconnect());

function headers(): HeadersInit {
  return { "X-Internal-Token": internalToken, "X-Principal": principal };
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return app.request(path, { ...init, headers: { ...headers(), ...(init.headers ?? {}) } });
}

test("health reports actionable provider setup and production upload guard", async () => {
  const health = await request("/v1/runtime/health");
  assert.equal(health.status, 200);
  const body = RuntimeHealthResponseSchema.parse(await health.json()).data;
  assert.equal(body.status, "NOT_CONFIGURED");
  assert.equal(body.components.find((component) => component.id === "provider")?.status, "NOT_CONFIGURED");
  assert(!JSON.stringify(body).match(/password|token|credential|[A-Z]:[\\/]/i));

  const form = new FormData();
  form.set("title", "无 Provider 课件");
  form.set("file", new File(["not-read"], "课件.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
  const blocked = await request("/v1/projects", { method: "POST", body: form });
  assert.equal(blocked.status, 409);
  assert.equal(ApiErrorSchema.parse(await blocked.json()).error.code, "PROVIDER_NOT_CONFIGURED");
});

test("health becomes ready after a configured default Provider passes its connection test", async () => {
  const created = await request("/v1/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "P6 Provider",
      kind: "DEEPSEEK",
      protocol: "OPENAI_CHAT",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      enabled: true,
      isDefault: true,
      apiKey: "sk-p6-runtime-health-key",
    }),
  });
  const provider = ProviderProfileResponseSchema.parse(await created.json()).data;
  const tested = await request(`/v1/providers/${provider.id}/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: provider.version }),
  });
  assert.equal(tested.status, 200);

  const health = RuntimeDiagnosticResponseSchema.parse(await (await request("/v1/runtime/diagnostic")).json()).data.health;
  assert.equal(health.components.find((component) => component.id === "provider")?.status, "READY");
  assert.equal(health.components.find((component) => component.id === "edge-tts")?.status, "WARN");
});
