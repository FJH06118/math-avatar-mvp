import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";
import {
  ParseAdapterDeckSchema,
  ParseSnapshotResponseSchema,
  ProjectResponseSchema,
  TracerTaskResponseSchema,
  TracerUploadResponseSchema,
} from "@ppt-digital-human/contracts";
import sharp from "sharp";
import { createApplication } from "./app.ts";
import {
  clearProductState,
  createProductPool,
  createProductPrismaClient,
} from "./database.ts";
import { dispatchOutboxEvent, dispatchPendingOutbox } from "./dispatcher.ts";
import { PythonParseAdapter, type ParseAdapter } from "./parse-adapter.ts";
import { runClaimedParseStep } from "./parse-worker.ts";
import {
  claimNextProductStep,
  heartbeatProductLease,
} from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";
import { staticAnimationManifestFixture } from "./test-animation-fixture.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("PPT_DH_DATABASE_URL is required for stage T-B integration tests.");
}

const prisma = createProductPrismaClient(databaseUrl);
const pool = createProductPool(databaseUrl);
const internalToken = "stage-tb-integration-token";
const principal = "internal-test-user";
let assetRoot = "";
let attemptRoot = "";
let fixture: Uint8Array;

before(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-tb-assets-"));
  attemptRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-tb-attempts-"));
  const fixturePath = process.env.PPT_DH_TRACER_FIXTURE
    ? resolve(process.env.PPT_DH_TRACER_FIXTURE)
    : fileURLToPath(new URL("../tests/fixtures/tracer-3.pptx", import.meta.url));
  fixture = await readFile(fixturePath);
});

beforeEach(async () => clearProductState(prisma));

after(async () => {
  await prisma.$disconnect();
  await pool.end();
  await rm(assetRoot, { recursive: true, force: true });
  await rm(attemptRoot, { recursive: true, force: true });
});

async function createParseTask(key: string) {
  const app = createApplication({ prisma, assetRoot, internalToken });
  const form = new FormData();
  form.set("title", "导数前三页");
  form.set(
    "file",
    new File(
      [fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer],
      "导数前三页.pptx",
      { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
    ),
  );
  const response = await app.request("/v1/projects", {
    method: "POST",
    headers: {
      "X-Internal-Token": internalToken,
      "X-Principal": principal,
      "Idempotency-Key": key,
    },
    body: form,
  });
  assert.equal(response.status, 201);
  return TracerUploadResponseSchema.parse(await response.json()).data;
}

async function cancelTask(taskId: string): Promise<Response> {
  const app = createApplication({ prisma, assetRoot, internalToken });
  return app.request(`/v1/tasks/${taskId}/cancel`, {
    method: "POST",
    headers: { "X-Internal-Token": internalToken, "X-Principal": principal },
  });
}

test("dispatcher replay creates one stable PARSE step", async () => {
  const receipt = await createParseTask("stage-tb-dispatch");
  const event = await prisma.taskOutbox.findFirstOrThrow({ where: { taskId: receipt.task.id } });
  const first = await dispatchOutboxEvent(prisma, event.id);
  const replay = await dispatchOutboxEvent(prisma, event.id);
  assert.equal(first, replay);
  assert.equal(await prisma.generationTaskStep.count({ where: { taskId: receipt.task.id } }), 1);
  assert.equal(await dispatchPendingOutbox(prisma), 0);
});

test("real parse worker registers 3/3 original pages and durable progress", async () => {
  const receipt = await createParseTask("stage-tb-real-parse");
  assert.equal(await dispatchPendingOutbox(prisma), 1);
  const claim = await claimNextProductStep(pool, "parse-worker-real", 5_000);
  assert(claim);
  const result = await runClaimedParseStep(
    {
      prisma,
      pool,
      assets: new LocalAssetStore(assetRoot),
      adapter: new PythonParseAdapter("python"),
      attemptRoot,
      leaseMs: 5_000,
    },
    claim,
    "parse-worker-real",
  );
  assert.equal(result, "SUCCEEDED");

  const task = await prisma.generationTask.findUniqueOrThrow({ where: { id: receipt.task.id } });
  const presentation = await prisma.presentation.findUniqueOrThrow({
    where: { id: receipt.presentation.id },
  });
  const slides = await prisma.slide.findMany({
    where: { presentationId: receipt.presentation.id },
    orderBy: { slideNumber: "asc" },
  });
  assert.equal(task.status, "SUCCEEDED");
  assert.equal(task.progressCompleted, 3);
  assert.equal(task.progressTotal, 3);
  assert.equal(presentation.parseStatus, "COMPLETED");
  assert.equal(presentation.slideCount, 3);
  assert(presentation.animationManifestJson);
  assert.equal(slides.length, 3);
  assert.deepEqual(slides.map((slide) => slide.slideNumber), [1, 2, 3]);
  assert(slides.every((slide) => slide.renderAssetId));
  assert.equal(
    await prisma.asset.count({ where: { projectId: receipt.project.id, kind: "SLIDE_RENDER" } }),
    3,
  );
  assert.equal(
    await prisma.taskStepAttempt.count({ where: { taskStepId: claim.taskStepId, status: "SUCCEEDED" } }),
    1,
  );
  const app = createApplication({ prisma, assetRoot, internalToken });
  const publicTask = await app.request(`/v1/tasks/${receipt.task.id}`, {
    headers: { "X-Internal-Token": internalToken, "X-Principal": principal },
  });
  assert.equal(publicTask.status, 200);
  const publicBody = TracerTaskResponseSchema.parse(await publicTask.json());
  assert.equal(publicBody.data.status, "SUCCEEDED");
  assert.equal(publicBody.data.progressCompleted, 3);
  assert.equal(publicBody.data.progressTotal, 3);

  const snapshotResponse = await app.request(`/v1/tasks/${receipt.task.id}/parsing`, {
    headers: { "X-Internal-Token": internalToken, "X-Principal": principal },
  });
  assert.equal(snapshotResponse.status, 200);
  const snapshot = ParseSnapshotResponseSchema.parse(await snapshotResponse.json()).data;
  assert.deepEqual(snapshot.slides.map((slide) => slide.slideNumber), [1, 2, 3]);
  assert.equal(new Set(snapshot.slides.map((slide) => slide.id)).size, 3);
  assert(snapshot.slides.every((slide) => slide.originalPage.url.endsWith("/preview")));
  assert.equal(snapshot.animationManifest.slideCount, 3);
  assert.deepEqual(snapshot.animationManifest.slides.map((slide) => slide.slideNumber), [1, 2, 3]);
  assert.doesNotMatch(JSON.stringify(snapshot.animationManifest), /storageKey|diskPath|[A-Z]:\\|Traceback|COMError/i);

  const previewResponse = await app.request(snapshot.slides[0]!.originalPage.url.replace("/api/t", "/v1"), {
    headers: { "X-Internal-Token": internalToken, "X-Principal": principal },
  });
  assert.equal(previewResponse.status, 200);
  assert.equal(previewResponse.headers.get("content-type"), "image/png");
  const preview = new Uint8Array(await previewResponse.arrayBuffer());
  assert.deepEqual([...preview.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const foreignResponse = await app.request(`/v1/tasks/${receipt.task.id}/parsing`, {
    headers: { "X-Internal-Token": internalToken, "X-Principal": "other-user" },
  });
  assert.equal(foreignResponse.status, 404);
});

test("expired product lease is taken over as a new immutable attempt", async () => {
  await createParseTask("stage-tb-takeover");
  await dispatchPendingOutbox(prisma);
  const first = await claimNextProductStep(pool, "worker-lost", 120);
  assert(first);
  assert.equal(await heartbeatProductLease(pool, first, "worker-lost", 120), true);
  assert.equal(await claimNextProductStep(pool, "worker-recovery", 120), null);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  const recovered = await claimNextProductStep(pool, "worker-recovery", 120);
  assert(recovered);
  assert.equal(recovered.taskStepId, first.taskStepId);
  assert.equal(recovered.attempt, 2);
  const attempts = await prisma.taskStepAttempt.findMany({
    where: { taskStepId: first.taskStepId },
    orderBy: { attempt: "asc" },
  });
  assert.deepEqual(attempts.map((attempt) => attempt.status), ["FAILED", "RUNNING"]);
});

test("cancelled parse task cannot be claimed", async () => {
  const receipt = await createParseTask("stage-tb-cancel");
  await dispatchPendingOutbox(prisma);
  assert.equal((await cancelTask(receipt.task.id)).status, 200);
  assert.equal(await claimNextProductStep(pool, "worker-after-cancel", 500), null);
  const task = await prisma.generationTask.findUniqueOrThrow({ where: { id: receipt.task.id } });
  assert.equal(task.status, "CANCELLED");
});

test("retry replays the original task snapshot instead of current workspace state", async () => {
  const receipt = await createParseTask("stage-tb-retry-source");
  await dispatchPendingOutbox(prisma);
  assert.equal((await cancelTask(receipt.task.id)).status, 200);
  const app = createApplication({ prisma, assetRoot, internalToken });
  const response = await app.request(`/v1/tasks/${receipt.task.id}/retry`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Token": internalToken,
      "X-Principal": principal,
    },
    body: JSON.stringify({ projectId: receipt.project.id, idempotencyKey: "retry-stage-tb-001" }),
  });
  assert.equal(response.status, 201);
  const retried = TracerTaskResponseSchema.parse(await response.json()).data;
  assert.notEqual(retried.id, receipt.task.id);
  assert.equal(retried.projectId, receipt.project.id);
  assert.equal(retried.inputHash, receipt.task.inputHash);
  assert.equal(retried.status, "QUEUED");
  const projectResponse = await app.request(`/v1/projects/${receipt.project.id}`, {
    headers: { "X-Internal-Token": internalToken, "X-Principal": principal },
  });
  assert.equal(ProjectResponseSchema.parse(await projectResponse.json()).data.status, "parsing");
  const event = await prisma.taskOutbox.findFirstOrThrow({ where: { taskId: retried.id } });
  assert.equal(event.eventType, "PARSE_REQUESTED");
  const stepId = await dispatchOutboxEvent(prisma, event.id);
  assert.equal(await prisma.generationTaskStep.count({ where: { taskId: retried.id } }), 1);
  assert.equal(stepId, (await prisma.generationTaskStep.findFirstOrThrow({ where: { taskId: retried.id } })).id);
  const replay = await app.request(`/v1/tasks/${receipt.task.id}/retry`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Token": internalToken,
      "X-Principal": principal,
    },
    body: JSON.stringify({ projectId: receipt.project.id, idempotencyKey: "retry-stage-tb-001" }),
  });
  assert.equal(replay.status, 200);
  assert.equal(TracerTaskResponseSchema.parse(await replay.json()).data.id, retried.id);
});

test("active cancellation aborts the adapter and preserves one CANCELLED terminal state", async () => {
  const receipt = await createParseTask("stage-tb-active-cancel");
  await dispatchPendingOutbox(prisma);
  const claim = await claimNextProductStep(pool, "worker-active-cancel", 300);
  assert(claim);
  const workerRun = runClaimedParseStep(
    {
      prisma,
      pool,
      assets: new LocalAssetStore(assetRoot),
      adapter: {
        run: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          }),
      },
      attemptRoot,
      leaseMs: 300,
    },
    claim,
    "worker-active-cancel",
  );
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
  assert.equal((await cancelTask(receipt.task.id)).status, 200);
  assert.equal(await workerRun, "CANCELLED");
  const task = await prisma.generationTask.findUniqueOrThrow({ where: { id: receipt.task.id } });
  assert.equal(task.status, "CANCELLED");
  const attempts = await prisma.taskStepAttempt.findMany({ where: { taskStepId: claim.taskStepId } });
  assert.deepEqual(attempts.map((attempt) => attempt.status), ["CANCELLED"]);
});

test("missing original page is a hard failure and registers no reconstructed slide", async () => {
  const receipt = await createParseTask("stage-tb-missing-page");
  await dispatchPendingOutbox(prisma);
  const claim = await claimNextProductStep(pool, "worker-invalid-pages", 5_000);
  assert(claim);
  const result = await runClaimedParseStep(
    {
      prisma,
      pool,
      assets: new LocalAssetStore(assetRoot),
      adapter: incompletePageAdapter(),
      attemptRoot,
      leaseMs: 5_000,
    },
    claim,
    "worker-invalid-pages",
  );
  assert.equal(result, "FAILED");
  const task = await prisma.generationTask.findUniqueOrThrow({ where: { id: receipt.task.id } });
  assert.equal(task.status, "FAILED");
  assert.equal(task.errorCode, "ORIGINAL_PAGE_COUNT_MISMATCH");
  assert.equal(await prisma.slide.count({ where: { projectId: receipt.project.id } }), 0);
  assert.equal(
    await prisma.asset.count({ where: { projectId: receipt.project.id, kind: "SLIDE_RENDER" } }),
    0,
  );
});

function incompletePageAdapter(): ParseAdapter {
  return {
    async run(input) {
      const slidesDir = join(input.attemptDir, "slides");
      await mkdir(slidesDir, { recursive: true });
      const png = await sharp({
        create: { width: 1920, height: 1080, channels: 3, background: "white" },
      }).png().toBuffer();
      await writeFile(join(slidesDir, "slide-001.png"), png);
      await writeFile(join(slidesDir, "slide-002.png"), png);
      const slides = [1, 2, 3].map((index) => ({
        index,
        title: `第${index}页`,
        type: "summary",
        textBlocks: [],
        extractedText: "",
        notes: "",
        formulas: [],
        thumbnail: `slides/slide-${String(index).padStart(3, "0")}.png`,
      }));
      const deck = ParseAdapterDeckSchema.parse({
        schemaVersion: 1,
        sourceFile: "source.pptx",
        courseTitle: "导数",
        slideCount: 3,
        parsedAt: "2026-08-03T00:00:00+00:00",
        slides,
        slideRenderer: "libreoffice",
        slideRenderError: null,
        animationManifest: staticAnimationManifestFixture(
          createHash("sha256").update(await readFile(input.sourcePath)).digest("hex"),
          3,
        ),
      });
      return { deck, attemptDir: input.attemptDir };
    },
  };
}
