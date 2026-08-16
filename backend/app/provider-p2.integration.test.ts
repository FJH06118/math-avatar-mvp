import "dotenv/config";

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  ApiErrorSchema,
  ApplicationSettingsResponseSchema,
  ProviderProfileListResponseSchema,
  ProviderProfileResponseSchema,
  ProviderTestResponseSchema,
} from "@ppt-digital-human/contracts";
import { createApplication } from "./app.ts";
import { clearProductState, createProductPrismaClient } from "./database.ts";
import { InMemorySecretClient } from "./secret-client.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for P2 provider tests.");

const prisma = createProductPrismaClient(databaseUrl);
const secretClient = new InMemorySecretClient();
const internalToken = "p2-provider-integration-token";
const principal = "p2-provider-user";
const app = createApplication({ prisma, assetRoot: "", internalToken, secretClient });

beforeEach(async () => {
  await clearProductState(prisma);
});

after(async () => {
  await prisma.$disconnect();
});

function headers(selectedPrincipal = principal): HeadersInit {
  return {
    "X-Internal-Token": internalToken,
    "X-Principal": selectedPrincipal,
    "content-type": "application/json",
  };
}

async function request(path: string, init: RequestInit = {}, selectedPrincipal = principal): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: { ...headers(selectedPrincipal), ...(init.headers ?? {}) },
  });
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "DeepSeek 主模型",
    kind: "DEEPSEEK",
    protocol: "OPENAI_CHAT",
    baseUrl: "https://api.deepseek.com/v1/",
    model: "deepseek-chat",
    enabled: true,
    isDefault: true,
    apiKey: "sk-test-provider-key-v1",
    ...overrides,
  };
}

test("P2 stores only redacted profile metadata and preserves old key versions on rotation", async () => {
  const created = await request("/v1/providers", {
    method: "POST",
    body: JSON.stringify(createBody()),
  });
  assert.equal(created.status, 201);
  const createdBody = ProviderProfileResponseSchema.parse(await created.json()).data;
  assert.equal(createdBody.keyConfigured, true);
  assert.equal(createdBody.keyVersion, 1);
  assert.equal(createdBody.baseUrl, "https://api.deepseek.com/v1");
  assert(!JSON.stringify(createdBody).includes("sk-test-provider-key-v1"));

  const stored = await prisma.providerProfile.findUnique({ where: { id: createdBody.id } });
  assert(stored);
  assert(!JSON.stringify(stored).includes("sk-test-provider-key-v1"));
  assert.equal(await secretClient.get(stored.credentialRef, 1), "sk-test-provider-key-v1");

  const updated = await request(`/v1/providers/${createdBody.id}`, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion: 1, model: "deepseek-reasoner", apiKey: "sk-test-provider-key-v2" }),
  });
  assert.equal(updated.status, 200);
  const updatedBody = ProviderProfileResponseSchema.parse(await updated.json()).data;
  assert.equal(updatedBody.keyVersion, 2);
  assert.equal(updatedBody.version, 2);
  assert.equal(await secretClient.get(stored.credentialRef, 1), "sk-test-provider-key-v1");
  assert.equal(await secretClient.get(stored.credentialRef, 2), "sk-test-provider-key-v2");

  const tested = await request(`/v1/providers/${createdBody.id}/test`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: 2 }),
  });
  assert.equal(tested.status, 200);
  assert.equal(ProviderTestResponseSchema.parse(await tested.json()).data.status, "CONFIGURED");
});

test("P2 enforces strict input, optimistic versions, principal isolation, and default deletion protection", async () => {
  const invalid = await request("/v1/providers", {
    method: "POST",
    body: JSON.stringify({ ...createBody(), baseUrl: "https://user:pass@example.test/v1", unexpected: true }),
  });
  assert.equal(invalid.status, 400);

  const first = ProviderProfileResponseSchema.parse(
    await (
      await request("/v1/providers", { method: "POST", body: JSON.stringify(createBody()) })
    ).json(),
  ).data;
  const second = ProviderProfileResponseSchema.parse(
    await (
      await request("/v1/providers", {
        method: "POST",
        body: JSON.stringify(createBody({ displayName: "Kimi", kind: "KIMI", isDefault: false, apiKey: undefined })),
      })
    ).json(),
    ).data;

  const changed = await request(`/v1/providers/${first.id}`, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion: 1, model: "deepseek-reasoner" }),
  });
  assert.equal(changed.status, 200);
  const currentFirst = ProviderProfileResponseSchema.parse(await changed.json()).data;

  const stale = await request(`/v1/providers/${first.id}`, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion: 1, model: "stale" }),
  });
  assert.equal(stale.status, 409);

  const hidden = await request(`/v1/providers/${first.id}/test`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: currentFirst.version }),
  }, "another-p2-user");
  assert.equal(hidden.status, 404);
  assert.equal(ApiErrorSchema.parse(await hidden.json()).error.code, "PROVIDER_PROFILE_NOT_FOUND");

  const deleteDefault = await request(`/v1/providers/${first.id}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion: currentFirst.version }),
  });
  assert.equal(deleteDefault.status, 409);

  const makeDefault = await request(`/v1/providers/${second.id}/default`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: second.version }),
  });
  assert.equal(makeDefault.status, 200);

  const deleted = await request(`/v1/providers/${first.id}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion: currentFirst.version }),
  });
  assert.equal(deleted.status, 204);
  assert.equal(await prisma.providerProfile.count({ where: { id: first.id } }), 0);

  const list = await request("/v1/providers");
  assert.equal(list.status, 200);
  assert.equal(ProviderProfileListResponseSchema.parse(await list.json()).data.length, 1);
  const settings = await request("/v1/settings");
  assert.equal(settings.status, 200);
  assert.equal(ApplicationSettingsResponseSchema.parse(await settings.json()).data.defaultProviderId, second.id);
});
