import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { after, before, beforeEach, test } from "node:test";
import { clearT0State, createT0Pool, createT0PrismaClient } from "./database.ts";
import {
  claimNextStep,
  completeLeasedStep,
  failLeasedStep,
  heartbeatLease,
  requestCancellation,
} from "./lease-worker.ts";
import {
  createTaskWithOutbox,
  deliverOutboxEvent,
  IdempotencyKeyReusedError,
} from "./task-store.ts";

const prisma = createT0PrismaClient();
const pool = createT0Pool();

function newTaskInput(idempotencyKey = randomUUID()) {
  return {
    principal: "t0-local-principal",
    kind: "GENERATE",
    idempotencyKey,
    payload: { fixture: "t0", request: randomUUID() },
  };
}

async function createQueuedStep() {
  const task = await createTaskWithOutbox(prisma, newTaskInput());
  const event = await prisma.t0Outbox.findFirstOrThrow({ where: { taskId: task.taskId } });
  const taskStepId = await deliverOutboxEvent(prisma, event.id);
  return { taskId: task.taskId, taskStepId, eventId: event.id };
}

function waitForClaim(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Killed worker did not acquire a lease.")), 5_000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("\n")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

before(async () => {
  await pool.query("SELECT 1");
});

beforeEach(async () => {
  await clearT0State(pool);
});

after(async () => {
  await prisma.$disconnect();
  await pool.end();
});

test("migrations apply on a fresh database and the raw partial indexes apply forward", async () => {
  const migrationNames = [
    "20260802114023_t0_initial",
    "20260802114500_t0_step_partial_keys",
    "20260803120000_stage_ta_product_boundary",
    "20260803173000_stage_tb_parse_worker",
    "20260804103000_stage_tc_lesson_plan",
    "20260804153000_stage_td_audio",
    "20260804154500_stage_td_sentence_steps",
    "20260804170000_stage_te_page_render",
    "20260804180000_stage_tf_media_validation",
    "20260804193000_stage_3_project_lifecycle",
    "20260804203000_stage_6_workspace_locks",
    "20260804223000_stage_7_teaching_settings",
    "20260813023000_lip_sync_v1",
    "20260817100000_provider_profiles",
  ];
  const applied = await pool.query<{ migration_name: string }>(
    'SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name',
  );
  assert.deepEqual(applied.rows.map((row) => row.migration_name), migrationNames);

  const schema = "t0_forward_migration";
  const client = await pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const migrationName of migrationNames) {
      const sql = await readFile(
        new URL(`../prisma/migrations/${migrationName}/migration.sql`, import.meta.url),
        "utf8",
      );
      await client.query(sql);
    }
    const indexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() ORDER BY indexname",
    );
    assert(indexes.rows.some((row) => row.indexname === "T0TaskStep_task_stage_without_slide_key"));
    assert(indexes.rows.some((row) => row.indexname === "T0TaskStep_task_stage_with_slide_key"));
    assert(indexes.rows.some((row) => row.indexname === "Slide_presentationId_slideNumber_key"));
    assert(indexes.rows.some((row) => row.indexname === "GenerationTaskStep_task_stage_slide_input_key"));
    const productTables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()",
    );
    assert(productTables.rows.some((row) => row.tablename === "TaskStepAttempt"));
    assert(productTables.rows.some((row) => row.tablename === "LessonPlanRevision"));
    assert(productTables.rows.some((row) => row.tablename === "AudioSegment"));
    assert(productTables.rows.some((row) => row.tablename === "AudioTimelineRecord"));
    assert(productTables.rows.some((row) => row.tablename === "RenderedPage"));
    assert(productTables.rows.some((row) => row.tablename === "MediaOutput"));
    assert(productTables.rows.some((row) => row.tablename === "MediaValidationRecord"));
    const lipSyncColumns = await client.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name IN ('AudioSegment', 'RenderedPage')
       AND column_name IN ('timingMetadata', 'avatarId', 'avatarAssetVersion', 'lipSyncTimeline', 'lipSyncTimelineHash')`,
    );
    const columns = new Map(lipSyncColumns.rows.map((row) => [row.column_name, row]));
    assert.equal(columns.get("timingMetadata")?.is_nullable, "YES");
    assert.equal(columns.get("lipSyncTimeline")?.is_nullable, "YES");
    assert.equal(columns.get("lipSyncTimelineHash")?.is_nullable, "YES");
    assert.match(columns.get("avatarId")?.column_default ?? "", /avatar-zhou/);
    assert.match(columns.get("avatarAssetVersion")?.column_default ?? "", /legacy-static-v1/);
  } finally {
    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
  }
});

test("task and outbox share a transaction and idempotency distinguishes payloads", async () => {
  const input = newTaskInput("same-key");
  const first = await createTaskWithOutbox(prisma, input);
  const duplicate = await createTaskWithOutbox(prisma, input);
  const reorderedDuplicate = await createTaskWithOutbox(prisma, {
    ...input,
    payload: { request: input.payload.request, fixture: input.payload.fixture },
  });
  assert.equal(first.created, true);
  assert.deepEqual(duplicate, { taskId: first.taskId, created: false });
  assert.deepEqual(reorderedDuplicate, { taskId: first.taskId, created: false });
  await assert.rejects(
    createTaskWithOutbox(prisma, { ...input, payload: { changed: true } }),
    IdempotencyKeyReusedError,
  );

  await assert.rejects(
    prisma.$transaction(async (transaction) => {
      const taskId = randomUUID();
      await transaction.t0Task.create({
        data: {
          id: taskId,
          principal: "rollback-principal",
          kind: "GENERATE",
          idempotencyKey: "rollback-key",
          inputHash: "rollback-hash",
          status: "QUEUED",
        },
      });
      await transaction.t0Outbox.create({
        data: {
          id: randomUUID(),
          taskId,
          eventKey: `rollback:${taskId}`,
          eventType: "T0_STEP",
          payload: { rollback: true },
        },
      });
      throw new Error("force rollback");
    }),
    /force rollback/,
  );
  assert.equal(
    await prisma.t0Task.count({ where: { principal: "rollback-principal" } }),
    0,
  );
  assert.equal(await prisma.t0Outbox.count({ where: { eventType: "T0_STEP" } }), 1);
});

test("outbox replay does not duplicate a logical task step", async () => {
  const { taskId, eventId } = await createQueuedStep();
  const firstStepId = await deliverOutboxEvent(prisma, eventId);
  const replayedStepId = await deliverOutboxEvent(prisma, eventId);
  assert.equal(firstStepId, replayedStepId);
  assert.equal(await prisma.t0TaskStep.count({ where: { taskId } }), 1);

  await assert.rejects(
    pool.query(
      `INSERT INTO "T0TaskStep" ("id", "taskId", "stage", "updatedAt")
       VALUES ($1, $2, 'T0_PROBE', NOW())`,
      [randomUUID(), taskId],
    ),
    (error: { code?: string }) => error.code === "23505",
  );
});

test("two workers claim only one attempt and heartbeat postpones lease takeover", async () => {
  const { taskStepId } = await createQueuedStep();
  const firstWorker = createT0Pool();
  const secondWorker = createT0Pool();
  try {
    const claims = await Promise.all([
      claimNextStep(firstWorker, "worker-a", 120),
      claimNextStep(secondWorker, "worker-b", 120),
    ]);
    const successfulClaims = claims.filter((claim) => claim !== null);
    assert.equal(successfulClaims.length, 1);
    const initialClaim = successfulClaims[0]!;
    assert.equal(initialClaim.taskStepId, taskStepId);
    assert.equal(await heartbeatLease(firstWorker, taskStepId, "worker-a", 120), claims[0] !== null);
    assert.equal(await heartbeatLease(secondWorker, taskStepId, "worker-b", 120), claims[1] !== null);

    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.equal(await claimNextStep(secondWorker, "worker-b", 120), null);
    await new Promise((resolve) => setTimeout(resolve, 90));
    const takeover = await claimNextStep(secondWorker, "worker-b", 120);
    assert(takeover);
    assert.equal(takeover.taskStepId, taskStepId);
    assert.equal(takeover.attempt, 2);
  } finally {
    await firstWorker.end();
    await secondWorker.end();
  }
});

test("a killed worker lease expires and another worker takes over", async () => {
  const { taskStepId } = await createQueuedStep();
  const fixturePath = fileURLToPath(new URL("./fixtures/claim-and-hang.ts", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", fixturePath], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForClaim(child);
  child.kill();
  await once(child, "exit");
  await new Promise((resolve) => setTimeout(resolve, 140));

  const recoveryWorker = createT0Pool();
  try {
    const takeover = await claimNextStep(recoveryWorker, "recovery-worker", 120);
    assert(takeover);
    assert.equal(takeover.taskStepId, taskStepId);
    assert.equal(takeover.attempt, 2);
  } finally {
    await recoveryWorker.end();
  }
});

test("cancellation and completion race to exactly one terminal task state", async () => {
  const { taskId, taskStepId } = await createQueuedStep();
  const worker = createT0Pool();
  try {
    const claim = await claimNextStep(worker, "race-worker", 500);
    assert(claim);
    const [completion, cancellationAccepted] = await Promise.all([
      completeLeasedStep(worker, taskStepId, "race-worker"),
      requestCancellation(worker, taskId),
    ]);
    const task = await prisma.t0Task.findUniqueOrThrow({ where: { id: taskId } });
    const step = await prisma.t0TaskStep.findUniqueOrThrow({ where: { id: taskStepId } });
    assert(["SUCCEEDED", "CANCELLED"].includes(task.status));
    assert.equal(completion, task.status);
    assert.equal(cancellationAccepted, task.status === "CANCELLED");
    assert.equal(step.status, task.status);
  } finally {
    await worker.end();
  }
});

test("failed attempts retry up to their declared limit", async () => {
  const { taskId, taskStepId } = await createQueuedStep();
  const worker = createT0Pool();
  try {
    assert(await claimNextStep(worker, "retry-worker", 500));
    assert.equal(await failLeasedStep(worker, taskStepId, "retry-worker", 2), "QUEUED");
    const retry = await claimNextStep(worker, "retry-worker", 500);
    assert(retry);
    assert.equal(retry.attempt, 2);
    assert.equal(await failLeasedStep(worker, taskStepId, "retry-worker", 2), "FAILED");
    const task = await prisma.t0Task.findUniqueOrThrow({ where: { id: taskId } });
    assert.equal(task.status, "FAILED");
  } finally {
    await worker.end();
  }
});
