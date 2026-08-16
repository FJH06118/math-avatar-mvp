import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import {
  LessonPlanRevisionSchema,
  WorkflowRunResponseSchema,
  WorkflowRunSchema,
} from "@ppt-digital-human/contracts";
import type { Prisma } from "../generated/prisma/client.ts";
import { createApplication } from "./app.ts";
import { AudioRepository } from "./audio-repository.ts";
import { clearProductState, createProductPool, createProductPrismaClient } from "./database.ts";
import { LessonPlanRepository } from "./lesson-plan-repository.ts";
import { ProductRepository } from "./repository.ts";
import { RenderRepository } from "./render-repository.ts";
import { MediaRepository } from "./media-repository.ts";
import { WorkflowOrchestrator } from "./workflow-orchestrator.ts";
import { claimNextWorkflow, runClaimedWorkflow } from "./workflow-worker.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for workflow integration tests.");

const prisma = createProductPrismaClient(databaseUrl);
const pool = createProductPool(databaseUrl);
const internalToken = "workflow-integration-token";
const principal = "internal-test-user";

beforeEach(async () => clearProductState(prisma));
after(async () => {
  await prisma.$disconnect();
  await pool.end();
});

test("WorkflowRun owns every generation stage and survives an expired worker lease", async () => {
  const seeded = await seedApprovedPresentation("workflow_full");
  const app = createApplication({ prisma, assetRoot: "C:/workflow-assets", internalToken });
  const input = {
    presentationId: seeded.presentationId,
    idempotencyKey: "workflow-full-idempotency",
  };
  const createdResponse = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(createdResponse.status, 201);
  const created = WorkflowRunResponseSchema.parse(await createdResponse.json()).data;
  assert.equal(created.currentStage, "AUDIO");

  const replayResponse = await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(replayResponse.status, 200);
  assert.equal(WorkflowRunResponseSchema.parse(await replayResponse.json()).data.id, created.id);
  assert.equal(await prisma.workflowRun.count(), 1);

  const renderStub = new StubStageRepository(prisma, "GENERATE", "PAGE_RENDER");
  const mediaStub = new StubStageRepository(prisma, "VALIDATE", "COMPOSITE");
  const orchestrator = testOrchestrator(renderStub, mediaStub);

  await prisma.workflowRun.update({
    where: { id: created.id },
    data: { leaseOwner: "dead-worker", leaseExpiresAt: new Date(Date.now() - 1_000) },
  });
  const firstClaim = await claimNextWorkflow(pool, "recovered-worker", 8_000);
  assert(firstClaim);
  assert.equal(
    await runClaimedWorkflow({ prisma, orchestrator }, firstClaim, "recovered-worker"),
    "WAITING",
  );
  const firstAudio = await prisma.workflowRun.findUniqueOrThrow({ where: { id: created.id } });
  assert(firstAudio.audioTaskId);
  assert.equal(await prisma.generationTask.count({ where: { kind: "AUDIO" } }), 1);

  await prisma.generationTask.update({
    where: { id: firstAudio.audioTaskId },
    data: { status: "SUCCEEDED", progressCompleted: 1, completedAt: new Date() },
  });
  const audioDoneClaim = await claimNextWorkflow(pool, "recovered-worker", 8_000);
  assert(audioDoneClaim);
  assert.equal(
    await runClaimedWorkflow({ prisma, orchestrator }, audioDoneClaim, "recovered-worker"),
    "WAITING",
  );
  const withRender = await prisma.workflowRun.findUniqueOrThrow({ where: { id: created.id } });
  assert(withRender.renderTaskId);
  assert.equal(withRender.currentStage, "PAGE_RENDER");
  assert.equal(await prisma.generationTask.count({ where: { kind: "GENERATE" } }), 1);

  await prisma.generationTask.update({
    where: { id: withRender.renderTaskId },
    data: { status: "SUCCEEDED", progressCompleted: 1, completedAt: new Date() },
  });
  const renderDoneClaim = await claimNextWorkflow(pool, "recovered-worker", 8_000);
  assert(renderDoneClaim);
  assert.equal(
    await runClaimedWorkflow({ prisma, orchestrator }, renderDoneClaim, "recovered-worker"),
    "WAITING",
  );
  const withMedia = await prisma.workflowRun.findUniqueOrThrow({ where: { id: created.id } });
  assert(withMedia.compositeTaskId);
  assert.equal(withMedia.currentStage, "COMPOSITE");
  assert.equal(await prisma.generationTask.count({ where: { kind: "VALIDATE" } }), 1);

  await prisma.generationTask.update({
    where: { id: withMedia.compositeTaskId },
    data: { stage: "VALIDATE", status: "SUCCEEDED", progressCompleted: 2, progressTotal: 2, completedAt: new Date() },
  });
  const finalClaim = await claimNextWorkflow(pool, "recovered-worker", 8_000);
  assert(finalClaim);
  assert.equal(
    await runClaimedWorkflow({ prisma, orchestrator }, finalClaim, "recovered-worker"),
    "SUCCEEDED",
  );
  const finalResponse = await request(app, `/v1/workflows/${created.id}`);
  assert.equal(finalResponse.status, 200);
  const final = WorkflowRunSchema.parse(WorkflowRunResponseSchema.parse(await finalResponse.json()).data);
  assert.equal(final.status, "SUCCEEDED");
  assert.equal(final.finalTaskId, withMedia.compositeTaskId);
  assert.equal(final.progressCompleted, final.progressTotal);
});

test("root cancellation propagates to the child and retry creates one new child", async () => {
  const seeded = await seedApprovedPresentation("workflow_cancel");
  const app = createApplication({ prisma, assetRoot: "C:/workflow-assets", internalToken });
  const created = WorkflowRunResponseSchema.parse(
    await (await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ presentationId: seeded.presentationId, idempotencyKey: "workflow-cancel-idempotency" }),
    })).json(),
  ).data;
  const orchestrator = testOrchestrator(
    new StubStageRepository(prisma, "GENERATE", "PAGE_RENDER"),
    new StubStageRepository(prisma, "VALIDATE", "COMPOSITE"),
  );
  const claim = await claimNextWorkflow(pool, "cancel-worker", 8_000);
  assert(claim);
  await runClaimedWorkflow({ prisma, orchestrator }, claim, "cancel-worker");
  const beforeCancel = await prisma.workflowRun.findUniqueOrThrow({ where: { id: created.id } });
  assert(beforeCancel.audioTaskId);

  const cancelResponse = await request(app, `/v1/workflows/${created.id}/cancel`, { method: "POST" });
  assert.equal(cancelResponse.status, 200);
  const cancelClaim = await claimNextWorkflow(pool, "cancel-worker", 8_000);
  assert(cancelClaim);
  assert.equal(await runClaimedWorkflow({ prisma, orchestrator }, cancelClaim, "cancel-worker"), "CANCELLED");
  assert.equal((await prisma.generationTask.findUniqueOrThrow({ where: { id: beforeCancel.audioTaskId } })).status, "CANCELLED");
  assert.equal((await prisma.workflowRun.findUniqueOrThrow({ where: { id: created.id } })).status, "CANCELLED");

  const retryResponse = await request(app, `/v1/workflows/${created.id}/retry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "workflow-cancel-retry-1" }),
  });
  assert.equal(retryResponse.status, 202);
  const retryClaim = await claimNextWorkflow(pool, "cancel-worker", 8_000);
  assert(retryClaim);
  await runClaimedWorkflow({ prisma, orchestrator }, retryClaim, "cancel-worker");
  const afterRetry = await prisma.workflowRun.findUniqueOrThrow({ where: { id: created.id } });
  assert(afterRetry.audioTaskId);
  assert.notEqual(afterRetry.audioTaskId, beforeCancel.audioTaskId);
  assert.equal(await prisma.generationTask.count({ where: { kind: "AUDIO" } }), 2);
});

test("a failed final validation child leaves WorkflowRun failed, never completed", async () => {
  const seeded = await seedApprovedPresentation("workflow_failed");
  const app = createApplication({ prisma, assetRoot: "C:/workflow-assets", internalToken });
  const created = WorkflowRunResponseSchema.parse(
    await (await request(app, `/v1/projects/${seeded.projectId}/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ presentationId: seeded.presentationId, idempotencyKey: "workflow-failed-idempotency" }),
    })).json(),
  ).data;
  const task = await createTask({
    id: "task_workflow_failed_media",
    principal,
    projectId: seeded.projectId,
    presentationId: seeded.presentationId,
    kind: "VALIDATE",
    stage: "VALIDATE",
    status: "FAILED",
    errorCode: "MEDIA_VALIDATION_FAILED",
    errorMessage: "媒体硬门失败。",
  });
  await prisma.workflowRun.update({
    where: { id: created.id },
    data: {
      status: "RUNNING",
      currentStage: "VALIDATE",
      compositeTaskId: task.id,
      leaseOwner: "failure-worker",
      leaseExpiresAt: new Date(Date.now() + 8_000),
    },
  });
  const result = await new WorkflowOrchestrator(prisma).advance(created.id, "failure-worker");
  assert.equal(result, "FAILED");
  const failed = await prisma.workflowRun.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.errorCode, "MEDIA_VALIDATION_FAILED");
  assert.equal(failed.completedAt !== null, true);
});

function testOrchestrator(render: StubStageRepository, media: StubStageRepository) {
  return new WorkflowOrchestrator(
    prisma,
    new ProductRepository(prisma),
    new LessonPlanRepository(prisma),
    new AudioRepository(prisma),
    render as unknown as RenderRepository,
    media as unknown as MediaRepository,
  );
}

class StubStageRepository {
  constructor(
    private readonly prismaClient: typeof prisma,
    private readonly kind: "GENERATE" | "VALIDATE",
    private readonly stage: "PAGE_RENDER" | "COMPOSITE",
  ) {}

  async createTask(principal: string, projectId: string, input: { presentationId: string; idempotencyKey: string }) {
    const existing = await this.prismaClient.generationTask.findFirst({ where: { principal, kind: this.kind, idempotencyKey: input.idempotencyKey } });
    if (existing) return { task: existing, created: false };
    return { task: await createTask({
      id: `task_${this.kind.toLowerCase()}_${this.stage.toLowerCase()}`,
      principal,
      projectId,
      presentationId: input.presentationId,
      kind: this.kind,
      stage: this.stage,
      status: "QUEUED",
    }), created: true };
  }
}

async function createTask(input: {
  id: string;
  principal: string;
  projectId: string;
  presentationId: string;
  kind: "AUDIO" | "GENERATE" | "VALIDATE";
  stage: "AUDIO" | "PAGE_RENDER" | "COMPOSITE" | "VALIDATE";
  status: "QUEUED" | "FAILED";
  errorCode?: string;
  errorMessage?: string;
}) {
  return prisma.generationTask.create({
    data: {
      id: input.id,
      principal: input.principal,
      projectId: input.projectId,
      presentationId: input.presentationId,
      kind: input.kind,
      idempotencyKey: `stub_${input.id}`,
      inputHash: `hash_${input.id}`,
      configHash: `config_${input.id}`,
      status: input.status,
      stage: input.stage,
      progressCompleted: input.status === "FAILED" ? 0 : 0,
      progressTotal: 1,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    },
  });
}

async function seedApprovedPresentation(suffix: string) {
  const projectId = `project_${suffix}`;
  const presentationId = `presentation_${suffix}`;
  const sourceAssetId = `asset_source_${suffix}`;
  const slideId = `slide_${suffix}`;
  const renderAssetId = `asset_render_${suffix}`;
  const lessonPlanId = `lesson_${suffix}`;
  const revisionId = `revision_${suffix}`;
  await prisma.project.create({
    data: {
      id: projectId,
      principal,
      title: suffix,
      status: "READY",
      settings: {
        avatarId: "avatar-zhou",
        voiceId: "voice-qinghe",
        speechRate: 1,
        captionsEnabled: true,
        captionStyle: "clear",
        avatarPosition: "right",
        background: "light",
      },
    },
  });
  await prisma.asset.create({ data: { id: sourceAssetId, projectId, kind: "SOURCE_PPT", storageKey: `${suffix}/source.pptx`, sha256: "a".repeat(64), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", fileSize: 1 } });
  await prisma.presentation.create({ data: { id: presentationId, projectId, sourceAssetId, originalFileName: `${suffix}.pptx`, sha256: "a".repeat(64), fileSize: 1, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", slideCount: 1, parseStatus: "COMPLETED", parserVersion: "fixture" } });
  await prisma.asset.create({ data: { id: renderAssetId, projectId, kind: "SLIDE_RENDER", storageKey: `${suffix}/slide.png`, sha256: "b".repeat(64), mimeType: "image/png", fileSize: 1 } });
  await prisma.slide.create({ data: { id: slideId, projectId, presentationId, slideNumber: 1, title: "fixture", slideType: "concept", extractedText: "fixture", notes: "", formulaJson: [], renderAssetId, parseWarnings: [] } });
  await prisma.lessonPlan.create({ data: { id: lessonPlanId, projectId, presentationId, slideId, currentRevision: 1 } });
  const payload = LessonPlanRevisionSchema.parse({
    id: revisionId,
    lessonPlanId,
    slideId,
    revision: 1,
    teachingGoal: "fixture",
    narration: [{ id: `narration_${suffix}`, displayText: "显示文本", spokenText: "朗读文本" }],
    derivation: [],
    scenes: [{ id: `scene_${suffix}`, sourceSlides: [slideId], baseSlide: { sourceAssetId: renderAssetId, preservationMode: "FULL_PRESERVE", fit: "contain", mustShowFullSlide: true, fullSlideDurationMs: 3_000, fullRedesignAuthorizedByUser: false }, durationMs: 3_000, isSkipped: false }],
    sourceSlideCoverage: [slideId],
    preservationMode: "FULL_PRESERVE",
    estimatedDurationMs: 3_000,
    modelProvider: "fixture",
    modelName: "fixture",
    promptVersion: "fixture",
    schemaVersion: "stage-tc-agent-v1",
    inputHash: "input",
    outputHash: "output",
    createdBy: "agent",
    createdAt: new Date().toISOString(),
    approval: { status: "approved", approvedBy: principal, approvedAt: new Date().toISOString() },
  });
  await prisma.lessonPlanRevision.create({ data: { id: revisionId, lessonPlanId, slideId, revision: 1, payload: payload as unknown as Prisma.InputJsonValue, inputHash: payload.inputHash, outputHash: payload.outputHash, modelProvider: payload.modelProvider, modelName: payload.modelName, promptVersion: payload.promptVersion, schemaVersion: payload.schemaVersion, createdBy: payload.createdBy, approvalStatus: "approved", approvedBy: principal, approvedAt: new Date() } });
  return { projectId, presentationId };
}

function request(app: ReturnType<typeof createApplication>, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-Internal-Token", internalToken);
  headers.set("X-Principal", principal);
  return app.request(path, { ...init, headers });
}
