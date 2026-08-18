import "dotenv/config";

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  ApiErrorSchema,
  ApplicationSettingsResponseSchema,
  ProviderProfileListResponseSchema,
  ProviderProfileResponseSchema,
  ProviderSelectionSnapshotSchema,
  ProviderTestResponseSchema,
} from "@ppt-digital-human/contracts";
import { createApplication } from "./app.ts";
import { clearProductState, createProductPrismaClient } from "./database.ts";
import { LessonPlanRepository } from "./lesson-plan-repository.ts";
import { ProviderError } from "./providers/errors.ts";
import { InMemorySecretClient } from "./secret-client.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for P2 provider tests.");

const prisma = createProductPrismaClient(databaseUrl);
const secretClient = new InMemorySecretClient();
const internalToken = "p2-provider-integration-token";
const principal = "p2-provider-user";
let providerTestFailure: ProviderError | null = null;
let providerTestCalls = 0;
const app = createApplication({
  prisma,
  assetRoot: "",
  internalToken,
  secretClient,
  providerConnectionTester: {
    async test(input) {
      providerTestCalls += 1;
      assert.equal(input.apiKey, "sk-test-provider-key-v2");
      if (providerTestFailure) throw providerTestFailure;
    },
  },
});

beforeEach(async () => {
  providerTestFailure = null;
  providerTestCalls = 0;
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
  assert.equal(ProviderTestResponseSchema.parse(await tested.json()).data.status, "CONNECTED");
  assert.equal(providerTestCalls, 1);
});

test("P2 performs a real connection probe, clears stale success after edits, and returns safe failure codes", async () => {
  const created = ProviderProfileResponseSchema.parse(
    await (await request("/v1/providers", {
      method: "POST",
      body: JSON.stringify(createBody({ apiKey: "sk-test-provider-key-v2" })),
    })).json(),
  ).data;
  const connected = ProviderTestResponseSchema.parse(
    await (await request(`/v1/providers/${created.id}/test`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: created.version }),
    })).json(),
  ).data;
  assert.equal(connected.status, "CONNECTED");
  assert.equal(providerTestCalls, 1);

  const afterTest = (await request("/v1/providers")).json();
  const testedProfile = ProviderProfileListResponseSchema.parse(await afterTest).data[0];
  assert(testedProfile?.lastTestAt);
  const edited = ProviderProfileResponseSchema.parse(
    await (await request(`/v1/providers/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: testedProfile.version, model: "deepseek-reasoner" }),
    })).json(),
  ).data;
  assert.equal(edited.lastTestAt, null);

  providerTestFailure = new ProviderError(
    "PROVIDER_CONNECTION_FAILED",
    true,
    "secret upstream detail must not escape",
  );
  const failed = ProviderTestResponseSchema.parse(
    await (await request(`/v1/providers/${created.id}/test`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: edited.version }),
    })).json(),
  ).data;
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.errorCode, "PROVIDER_CONNECTION_FAILED");
  assert(!JSON.stringify(failed).includes("secret upstream detail"));
  const afterFailure = ProviderProfileListResponseSchema.parse(
    await (await request("/v1/providers")).json(),
  ).data[0];
  assert.equal(afterFailure?.lastTestAt, null);
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

test("provider rotation freezes a redacted selection snapshot per new PLAN task", async () => {
  const created = ProviderProfileResponseSchema.parse(
    await (
      await request("/v1/providers", { method: "POST", body: JSON.stringify(createBody()) })
    ).json(),
  ).data;
  const plans = new LessonPlanRepository(prisma);
  const firstPresentation = await seedPresentation("one");
  const first = await plans.createPlanTask(principal, firstPresentation.projectId, {
    presentationId: firstPresentation.id,
    idempotencyKey: "p2-snapshot-plan-one",
    audience: "大学一年级",
    style: "严谨",
    targetMinutes: 3,
  });

  const rotated = await request(`/v1/providers/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion: created.version, apiKey: "sk-test-provider-key-v2" }),
  });
  assert.equal(rotated.status, 200);

  const secondPresentation = await seedPresentation("two");
  const second = await plans.createPlanTask(principal, secondPresentation.projectId, {
    presentationId: secondPresentation.id,
    idempotencyKey: "p2-snapshot-plan-two",
    audience: "大学一年级",
    style: "严谨",
    targetMinutes: 3,
  });
  const outboxes = await prisma.taskOutbox.findMany({
    where: { taskId: { in: [first.task.id, second.task.id] } },
  });
  const snapshot = (taskId: string) => {
    const payload = outboxes.find((outbox) => outbox.taskId === taskId)?.payload;
    assert(payload && typeof payload === "object" && !Array.isArray(payload));
    return ProviderSelectionSnapshotSchema.parse((payload as Record<string, unknown>).providerSelection);
  };
  const oldSnapshot = snapshot(first.task.id);
  const newSnapshot = snapshot(second.task.id);
  assert.equal(oldSnapshot.keyVersion, 1);
  assert.equal(newSnapshot.keyVersion, 2);
  assert.equal(oldSnapshot.profileVersion, 1);
  assert.equal(newSnapshot.profileVersion, 2);
  assert(!JSON.stringify(outboxes).includes("sk-test-provider-key"));
});

async function seedPresentation(suffix: string) {
  const projectId = `project_p2_snapshot_${suffix}`;
  const assetId = `asset_p2_snapshot_${suffix}`;
  const presentationId = `presentation_p2_snapshot_${suffix}`;
  const slideId = `slide_p2_snapshot_${suffix}`;
  await prisma.project.create({ data: { id: projectId, principal, title: `P2 快照 ${suffix}`, status: "READY" } });
  await prisma.asset.create({
    data: {
      id: assetId,
      projectId,
      kind: "SOURCE_PPT",
      storageKey: `p2-snapshot-${suffix}.pptx`,
      sha256: "a".repeat(64),
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileSize: 1,
    },
  });
  await prisma.presentation.create({
    data: {
      id: presentationId,
      projectId,
      sourceAssetId: assetId,
      originalFileName: `${suffix}.pptx`,
      sha256: "a".repeat(64),
      fileSize: 1,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      slideCount: 1,
      parseStatus: "COMPLETED",
      parserVersion: "p2-fixture",
    },
  });
  await prisma.slide.create({
    data: {
      id: slideId,
      projectId,
      presentationId,
      slideNumber: 1,
      title: "导数",
      slideType: "concept",
      extractedText: "导数定义",
      notes: "",
      formulaJson: [],
      parseWarnings: [],
      renderAssetId: null,
    },
  });
  return { projectId, id: presentationId };
}
