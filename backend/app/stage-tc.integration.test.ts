import "dotenv/config";

import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";
import { createServer } from "node:http";
import {
  LessonPlanRevisionListResponseSchema,
  LessonPlanRevisionResponseSchema,
  PlanTaskResponseSchema,
  ProjectResponseSchema,
  TracerUploadResponseSchema,
  WorkspaceLockResponseSchema,
  WorkspaceSnapshotResponseSchema,
  type AgentPlanOutput,
} from "@ppt-digital-human/contracts";
import { createApplication } from "./app.ts";
import { OpenAiCompatibleAgentAdapter, type AgentAdapter } from "./agent-adapter.ts";
import { loadAgentProviderConfig } from "./config.ts";
import { clearProductState, createProductPool, createProductPrismaClient } from "./database.ts";
import { dispatchPendingOutbox } from "./dispatcher.ts";
import { PythonParseAdapter } from "./parse-adapter.ts";
import { runClaimedParseStep } from "./parse-worker.ts";
import { runClaimedPlanStep } from "./plan-worker.ts";
import { claimNextProductStep } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { WorkerError } from "./worker-error.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for stage T-C integration tests.");

const prisma = createProductPrismaClient(databaseUrl);
const pool = createProductPool(databaseUrl);
const internalToken = "stage-tc-integration-token";
const principal = "internal-test-user";
let assetRoot = "";
let attemptRoot = "";
let fixture: Uint8Array;

before(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-tc-assets-"));
  attemptRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-tc-attempts-"));
  fixture = await readFile(
    process.env.PPT_DH_TRACER_FIXTURE
      ? resolve(process.env.PPT_DH_TRACER_FIXTURE)
      : fileURLToPath(new URL("../tests/fixtures/tracer-3.pptx", import.meta.url)),
  );
});

beforeEach(async () => clearProductState(prisma));

after(async () => {
  await prisma.$disconnect();
  await pool.end();
  await rm(assetRoot, { recursive: true, force: true });
  await rm(attemptRoot, { recursive: true, force: true });
});

test("PLAN worker persists strict revisions, user edits, and explicit approval", async () => {
  const app = createApplication({ prisma, assetRoot, internalToken });
  const upload = await uploadProject(app, "stage-tc-upload");
  await dispatchPendingOutbox(prisma);
  const parseClaim = await claimNextProductStep(pool, "tc-parse-worker", 8_000);
  assert(parseClaim);
  assert.equal(await runClaimedParseStep({
    prisma,
    pool,
    assets: new LocalAssetStore(assetRoot),
    adapter: new PythonParseAdapter("python"),
    attemptRoot,
    leaseMs: 8_000,
  }, parseClaim, "tc-parse-worker"), "SUCCEEDED");

  const createPlanBody = {
    presentationId: upload.presentation.id,
    idempotencyKey: "stage-tc-plan-key",
    audience: "大学一年级学生",
    style: "严谨、逐页讲解",
    targetMinutes: 6,
  };
  const created = await request(app, `/v1/projects/${upload.project.id}/plans`, {
    method: "POST",
    body: JSON.stringify(createPlanBody),
    headers: { "content-type": "application/json" },
  });
  assert.equal(created.status, 201);
  const planTask = PlanTaskResponseSchema.parse(await created.json()).data;
  assert.equal(planTask.stage, "PLAN");
  const replay = await request(app, `/v1/projects/${upload.project.id}/plans`, {
    method: "POST", body: JSON.stringify(createPlanBody), headers: { "content-type": "application/json" },
  });
  assert.equal(replay.status, 200);
  assert.equal(PlanTaskResponseSchema.parse(await replay.json()).data.id, planTask.id);
  const projectWithPlan = await request(app, `/v1/projects/${upload.project.id}`);
  assert.equal(projectWithPlan.status, 200);
  assert.equal(
    ProjectResponseSchema.parse(await projectWithPlan.json()).data.planTaskId,
    planTask.id,
  );

  assert.equal(await dispatchPendingOutbox(prisma), 1);
  assert.equal(await dispatchPendingOutbox(prisma), 0);
  const planClaim = await claimNextProductStep(pool, "tc-plan-worker", 8_000, 3, "PLAN");
  assert(planClaim);
  const planResult = await runClaimedPlanStep({
    prisma,
    pool,
    assets: new LocalAssetStore(assetRoot),
    adapter: configuredAgent(),
    leaseMs: 8_000,
  }, planClaim, "tc-plan-worker");
  if (planResult !== "SUCCEEDED") {
    const failed = await prisma.generationTask.findUniqueOrThrow({ where: { id: planTask.id } });
    assert.fail(`PLAN result=${planResult}; code=${failed.errorCode}; message=${failed.errorMessage}`);
  }

  const listResponse = await request(app, `/v1/projects/${upload.project.id}/lesson-plans`);
  assert.equal(listResponse.status, 200);
  const revisions = LessonPlanRevisionListResponseSchema.parse(await listResponse.json()).data;
  assert.equal(revisions.length, 3);
  assert(revisions.every((revision) => revision.approval.status === "pending"));
  assert.equal(await prisma.plannedScene.count(), 3);
  assert.equal(await prisma.asset.count({ where: { kind: { notIn: ["SOURCE_PPT", "SLIDE_RENDER"] } } }), 0);

  const workspaceResponse = await request(app, `/v1/projects/${upload.project.id}/workspace`);
  assert.equal(workspaceResponse.status, 200);
  const workspace = WorkspaceSnapshotResponseSchema.parse(await workspaceResponse.json()).data;
  assert.equal(workspace.slides.length, 3);
  assert(workspace.slides.every((slide) => slide.parsed.originalPage.url.endsWith("/preview")));
  assert(workspace.slides.every((slide) => slide.currentRevision));

  const original = revisions[0];
  const unaffectedHashes = new Map(
    revisions.slice(1).map((revision) => [revision.id, revision.outputHash]),
  );
  const editPayload = {
    expectedRevision: original.revision,
    teachingGoal: `${original.teachingGoal}（人工修订）`,
    narration: original.narration,
    derivation: original.derivation,
    scenes: original.scenes,
    preservationMode: original.preservationMode,
    estimatedDurationMs: original.estimatedDurationMs,
  };
  const lockedResponse = await request(app, `/v1/revisions/${original.id}/lock`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision: original.revision, locked: true }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(lockedResponse.status, 200);
  assert.equal(WorkspaceLockResponseSchema.parse(await lockedResponse.json()).data.locked, true);
  assert.equal((await request(app, `/v1/revisions/${original.id}/revise`, {
    method: "POST",
    body: JSON.stringify(editPayload),
    headers: { "content-type": "application/json" },
  })).status, 409);
  const unlockedResponse = await request(app, `/v1/revisions/${original.id}/lock`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision: original.revision, locked: false }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(unlockedResponse.status, 200);
  const revisedResponse = await request(app, `/v1/revisions/${original.id}/revise`, {
    method: "POST",
    body: JSON.stringify(editPayload),
    headers: { "content-type": "application/json" },
  });
  assert.equal(revisedResponse.status, 201);
  const revised = LessonPlanRevisionResponseSchema.parse(await revisedResponse.json()).data;
  assert.equal(revised.revision, 2);
  assert.equal(revised.createdBy, "user");
  const unaffected = await prisma.lessonPlanRevision.findMany({
    where: { id: { in: [...unaffectedHashes.keys()] } },
  });
  assert(
    unaffected.every((revision) => unaffectedHashes.get(revision.id) === revision.outputHash),
  );
  assert.equal((await request(app, `/v1/revisions/${original.id}/revise`, {
    method: "POST", body: JSON.stringify(editPayload), headers: { "content-type": "application/json" },
  })).status, 409);

  const approvedResponse = await request(app, `/v1/revisions/${revised.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision: 2 }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(approvedResponse.status, 200);
  const approved = LessonPlanRevisionResponseSchema.parse(await approvedResponse.json()).data;
  assert.equal(approved.approval.status, "approved");
  assert.equal(approved.approval.status === "approved" && approved.approval.approvedBy, principal);
  const untouched = await prisma.lessonPlanRevision.findUniqueOrThrow({ where: { id: original.id } });
  assert.equal(untouched.approvalStatus, "pending");
});

test("PLAN calls an external Provider at most once per task and explicit retry is idempotent", async () => {
  const app = createApplication({ prisma, assetRoot, internalToken });
  const upload = await uploadProject(app, "stage-tc-no-auto-retry-upload");
  await dispatchPendingOutbox(prisma);
  const parseClaim = await claimNextProductStep(pool, "tc-no-retry-parse", 8_000);
  assert(parseClaim);
  assert.equal(await runClaimedParseStep({
    prisma,
    pool,
    assets: new LocalAssetStore(assetRoot),
    adapter: new PythonParseAdapter("python"),
    attemptRoot,
    leaseMs: 8_000,
  }, parseClaim, "tc-no-retry-parse"), "SUCCEEDED");

  const createBody = {
    presentationId: upload.presentation.id,
    idempotencyKey: "stage-tc-no-auto-retry-plan",
    audience: "大学一年级学生",
    style: "严谨、逐页讲解",
    targetMinutes: 6,
  };
  const first = PlanTaskResponseSchema.parse(await (await request(
    app,
    `/v1/projects/${upload.project.id}/plans`,
    { method: "POST", body: JSON.stringify(createBody), headers: { "content-type": "application/json" } },
  )).json()).data;
  await dispatchPendingOutbox(prisma);
  const claim = await claimNextProductStep(pool, "tc-no-retry-plan", 8_000, 2, "PLAN");
  assert(claim);
  let providerCalls = 0;
  const failingAdapter: AgentAdapter = {
    async run() {
      providerCalls += 1;
      throw new WorkerError("AGENT_CONNECTION_FAILED", "Provider 服务连接失败。", true);
    },
  };
  const failed = await runClaimedPlanStep({
    prisma,
    pool,
    assets: new LocalAssetStore(assetRoot),
    leaseMs: 8_000,
    maxAttempts: 1,
    maxExternalAttempts: 1,
    adapter: failingAdapter,
  }, claim, "tc-no-retry-plan");
  assert.equal(failed, "FAILED");
  assert.equal(providerCalls, 1);
  assert.equal(await claimNextProductStep(pool, "tc-no-retry-plan-2", 8_000, 1, "PLAN"), null);
  assert.equal(await prisma.taskStepAttempt.count({ where: { taskStep: { taskId: first.id } } }), 1);

  const retryBody = {
    ...createBody,
    idempotencyKey: `plan_retry_${first.id}`,
  };
  const retry = PlanTaskResponseSchema.parse(await (await request(
    app,
    `/v1/projects/${upload.project.id}/plans`,
    { method: "POST", body: JSON.stringify(retryBody), headers: { "content-type": "application/json" } },
  )).json()).data;
  const replay = PlanTaskResponseSchema.parse(await (await request(
    app,
    `/v1/projects/${upload.project.id}/plans`,
    { method: "POST", body: JSON.stringify(retryBody), headers: { "content-type": "application/json" } },
  )).json()).data;
  assert.notEqual(retry.id, first.id);
  assert.equal(replay.id, retry.id);
  assert.equal(await prisma.generationTask.count({ where: { projectId: upload.project.id, kind: "PLAN" } }), 2);

  await dispatchPendingOutbox(prisma);
  const interrupted = await claimNextProductStep(pool, "tc-interrupted-plan", 8_000, 2, "PLAN");
  assert(interrupted);
  await prisma.generationTaskStep.update({
    where: { id: interrupted.taskStepId },
    data: { leaseExpiresAt: new Date(0) },
  });
  const recovery = await claimNextProductStep(pool, "tc-plan-recovery", 8_000, 2, "PLAN");
  assert(recovery);
  assert.equal(recovery.attempt, 2);
  assert.equal(await runClaimedPlanStep({
    prisma,
    pool,
    assets: new LocalAssetStore(assetRoot),
    leaseMs: 8_000,
    maxAttempts: 1,
    maxExternalAttempts: 1,
    adapter: failingAdapter,
  }, recovery, "tc-plan-recovery"), "FAILED");
  assert.equal(providerCalls, 1);
  const recovered = await prisma.generationTask.findUniqueOrThrow({ where: { id: retry.id } });
  assert.equal(recovered.errorCode, "PLAN_RETRY_REQUIRES_USER");
});

test("OpenAI-compatible adapter treats provider JSON as unknown and rejects extra fields", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        schemaVersion: "stage-tc-agent-v1",
        slides: [{
          slideId: "slide_alpha",
          teachingGoal: "理解导数",
          narration: [{ displayText: "讲解导数。", spokenText: "讲解导数。" }],
          derivation: [],
          scenes: [{ durationMs: 3_000 }],
          preservationMode: "FULL_PRESERVE",
          untrustedExtra: true,
        }],
      }) } }],
    }));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const adapter = new OpenAiCompatibleAgentAdapter({
      apiKey: "test-key",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "local-stub",
    });
    await assert.rejects(
      adapter.run({
        slides: [{ id: "slide_alpha", title: "导数", slideType: "concept", extractedText: "导数定义", notes: "", formulas: [] }],
        audience: "大学一年级学生",
        style: "严谨",
        targetMinutes: 3,
        signal: new AbortController().signal,
      }),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "AGENT_OUTPUT_INVALID",
    );
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
});

async function uploadProject(app: ReturnType<typeof createApplication>, key: string) {
  const form = new FormData();
  form.set("title", "导数前三页");
  form.set("file", new File([fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer], "导数前三页.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
  const response = await request(app, "/v1/projects", { method: "POST", headers: { "Idempotency-Key": key }, body: form });
  assert.equal(response.status, 201);
  return TracerUploadResponseSchema.parse(await response.json()).data;
}

function request(app: ReturnType<typeof createApplication>, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-Internal-Token", internalToken);
  headers.set("X-Principal", principal);
  return app.request(path, { ...init, headers });
}

function validAgent(): AgentAdapter {
  return {
    async run(input) {
      assert(input.slides.every((slide) =>
        slide.image?.ref.startsWith("slide-image-") &&
        slide.image.mimeType === "image/jpeg" &&
        slide.image.base64.length > 0 &&
        slide.image.width > 0 &&
        slide.image.height > 0
      ));
      const output: AgentPlanOutput = {
        schemaVersion: "stage-tc-agent-v1",
        slides: input.slides.map((slide) => ({
          slideId: slide.id,
          teachingGoal: `理解${slide.title}`,
          narration: [{ displayText: `讲解${slide.title}。`, spokenText: `讲解${slide.title}。` }],
          derivation: [],
          scenes: [{ durationMs: 3_000 }],
          preservationMode: "FULL_PRESERVE",
        })),
      };
      return { output, provider: "integration-stub", model: "strict-fixture", promptVersion: "stage-tc-agent-prompt-v2-vision" };
    },
  };
}

function configuredAgent(): AgentAdapter {
  if (process.env.PPT_DH_STAGE_TC_REAL_AGENT !== "1") return validAgent();
  const agentProvider = loadAgentProviderConfig();
  assert(agentProvider, "LLM provider config is required for the authorized external test.");
  return new OpenAiCompatibleAgentAdapter(agentProvider);
}
