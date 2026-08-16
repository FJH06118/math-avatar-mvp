import "dotenv/config";

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";
import { TracerUploadResponseSchema } from "@ppt-digital-human/contracts";
import { reconcileLocalAssets } from "./asset-reconciler.ts";
import { createApplication } from "./app.ts";
import { clearProductState, createProductPool, createProductPrismaClient } from "./database.ts";
import { dispatchOutboxEvent, dispatchPendingOutbox } from "./dispatcher.ts";
import { PythonParseAdapter } from "./parse-adapter.ts";
import { runClaimedParseStep } from "./parse-worker.ts";
import { claimNextProductStep } from "./product-lease.ts";
import { LocalAssetStore } from "./storage.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for stage 11A recovery tests.");

const prisma = createProductPrismaClient(databaseUrl);
const pool = createProductPool(databaseUrl);
const internalToken = "stage-11a-integration-token";
let assetRoot = "";
let attemptRoot = "";
let fixture: Uint8Array;

before(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-11a-assets-"));
  attemptRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-11a-attempts-"));
  fixture = await readFile(fileURLToPath(new URL("../tests/fixtures/tracer-3.pptx", import.meta.url)));
});

beforeEach(async () => {
  await clearProductState(prisma);
  await rm(join(assetRoot, "projects"), { recursive: true, force: true });
});

after(async () => {
  await prisma.$disconnect();
  await pool.end();
  await rm(assetRoot, { recursive: true, force: true });
  await rm(attemptRoot, { recursive: true, force: true });
});

test("outbox replay and expired lease recovery finish one task without duplicate assets", async () => {
  const receipt = await createParseTask("stage-11a-recovery");
  const event = await prisma.taskOutbox.findFirstOrThrow({ where: { taskId: receipt.task.id } });
  const dispatched = await Promise.all([
    dispatchOutboxEvent(prisma, event.id),
    dispatchOutboxEvent(prisma, event.id),
    dispatchOutboxEvent(prisma, event.id),
  ]);
  assert.equal(new Set(dispatched).size, 1);
  assert.equal(await prisma.generationTaskStep.count({ where: { taskId: receipt.task.id } }), 1);

  const lost = await claimNextProductStep(pool, "stage-11a-lost-worker", 100);
  assert(lost);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 130));
  const recovered = await claimNextProductStep(pool, "stage-11a-recovery-worker", 5_000);
  assert(recovered);
  assert.equal(recovered.taskStepId, lost.taskStepId);
  assert.equal(recovered.attempt, 2);
  assert.equal(await runClaimedParseStep({
    prisma,
    pool,
    assets: new LocalAssetStore(assetRoot),
    adapter: new PythonParseAdapter("python"),
    attemptRoot,
    leaseMs: 5_000,
  }, recovered, "stage-11a-recovery-worker"), "SUCCEEDED");

  await dispatchOutboxEvent(prisma, event.id);
  assert.equal(await prisma.generationTask.count({ where: { id: receipt.task.id } }), 1);
  assert.equal(await prisma.generationTaskStep.count({ where: { taskId: receipt.task.id } }), 1);
  assert.equal(await prisma.asset.count({ where: { projectId: receipt.project.id } }), 4);
  assert.equal(await prisma.asset.count({ where: { projectId: receipt.project.id, kind: "SLIDE_RENDER" } }), 3);
  assert.deepEqual(
    (await prisma.taskStepAttempt.findMany({ where: { taskStepId: lost.taskStepId }, orderBy: { attempt: "asc" } })).map((attempt) => attempt.status),
    ["FAILED", "SUCCEEDED"],
  );
});

test("asset reconciliation preserves registered files and only deletes old unregistered files when enabled", async () => {
  const receipt = await createParseTask("stage-11a-reconcile");
  const registered = await prisma.asset.findFirstOrThrow({ where: { projectId: receipt.project.id } });
  const orphanKey = `projects/${receipt.project.id}/orphan/abandoned.tmp`;
  const orphanPath = resolve(assetRoot, orphanKey);
  await mkdir(dirname(orphanPath), { recursive: true });
  await writeFile(orphanPath, "orphan");

  const dryRun = await reconcileLocalAssets(prisma, assetRoot, {
    now: new Date(Date.now() + 60_000),
    graceMs: 1_000,
  });
  assert.deepEqual(dryRun.orphanKeys, [orphanKey]);
  assert.deepEqual(dryRun.deletedOrphanKeys, []);
  assert.equal((await stat(orphanPath)).isFile(), true);

  const applied = await reconcileLocalAssets(prisma, assetRoot, {
    deleteOrphans: true,
    now: new Date(Date.now() + 60_000),
    graceMs: 1_000,
  });
  assert.deepEqual(applied.deletedOrphanKeys, [orphanKey]);
  await assert.rejects(stat(orphanPath), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  assert.equal((await stat(new LocalAssetStore(assetRoot).resolveForRead(registered.storageKey))).isFile(), true);
  assert.deepEqual(applied.missingRegisteredKeys, []);
  assert.deepEqual(applied.corruptedRegisteredKeys, []);
});

async function createParseTask(idempotencyKey: string) {
  const app = createApplication({ prisma, assetRoot, internalToken });
  const form = new FormData();
  form.set("title", "阶段 11A 恢复样例");
  form.set("file", new File([
    fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer,
  ], "恢复样例.pptx", {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  }));
  const response = await app.request("/v1/projects", {
    method: "POST",
    headers: {
      "X-Internal-Token": internalToken,
      "X-Principal": "internal-test-user",
      "Idempotency-Key": idempotencyKey,
    },
    body: form,
  });
  assert.equal(response.status, 201);
  assert.equal(await dispatchPendingOutbox(prisma), 1);
  return TracerUploadResponseSchema.parse(await response.json()).data;
}
