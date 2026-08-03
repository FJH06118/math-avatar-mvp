import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface ClaimedStep {
  taskId: string;
  taskStepId: string;
  attempt: number;
}

export async function claimNextStep(
  pool: Pool,
  workerId: string,
  leaseMs: number,
): Promise<ClaimedStep | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claim = await client.query<{ id: string; taskId: string; currentAttempt: number }>(`
      WITH candidate AS (
        SELECT step."id"
        FROM "T0TaskStep" AS step
        INNER JOIN "T0Task" AS task ON task."id" = step."taskId"
        WHERE (
          step."status" = 'QUEUED'
          OR (step."status" = 'RUNNING' AND step."leaseExpiresAt" < NOW())
        )
        AND task."cancellationRequestedAt" IS NULL
        AND task."status" NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
        ORDER BY step."createdAt"
        FOR UPDATE OF step SKIP LOCKED
        LIMIT 1
      )
      UPDATE "T0TaskStep" AS step
      SET "status" = 'RUNNING',
          "leaseOwner" = $1,
          "leaseExpiresAt" = NOW() + ($2 * INTERVAL '1 millisecond'),
          "heartbeatAt" = NOW(),
          "currentAttempt" = step."currentAttempt" + 1,
          "updatedAt" = NOW()
      FROM candidate
      WHERE step."id" = candidate."id"
      RETURNING step."id", step."taskId", step."currentAttempt"
    `, [workerId, leaseMs]);

    const step = claim.rows[0];
    if (!step) {
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      `UPDATE "T0TaskStepAttempt" SET "status" = 'FAILED', "completedAt" = NOW()
       WHERE "taskStepId" = $1 AND "status" = 'RUNNING'`,
      [step.id],
    );
    await client.query(
      `INSERT INTO "T0TaskStepAttempt"
        ("id", "taskStepId", "attempt", "workerId", "status", "heartbeatAt")
       VALUES ($1, $2, $3, $4, 'RUNNING', NOW())`,
      [randomUUID(), step.id, step.currentAttempt, workerId],
    );
    await client.query(
      `UPDATE "T0Task" SET "status" = 'RUNNING', "updatedAt" = NOW()
       WHERE "id" = $1 AND "status" = 'QUEUED'`,
      [step.taskId],
    );
    await client.query("COMMIT");
    return { taskId: step.taskId, taskStepId: step.id, attempt: step.currentAttempt };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function heartbeatLease(
  pool: Pool,
  taskStepId: string,
  workerId: string,
  leaseMs: number,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE "T0TaskStep"
     SET "leaseExpiresAt" = NOW() + ($3 * INTERVAL '1 millisecond'),
         "heartbeatAt" = NOW(), "updatedAt" = NOW()
     WHERE "id" = $1 AND "leaseOwner" = $2 AND "status" = 'RUNNING'
       AND "leaseExpiresAt" > NOW()`,
    [taskStepId, workerId, leaseMs],
  );
  return result.rowCount === 1;
}

export async function completeLeasedStep(
  pool: Pool,
  taskStepId: string,
  workerId: string,
): Promise<"SUCCEEDED" | "CANCELLED"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const task = await client.query<{ id: string; status: string; cancellationRequestedAt: Date | null }>(
      `SELECT task."id", task."status", task."cancellationRequestedAt"
       FROM "T0Task" AS task
       INNER JOIN "T0TaskStep" AS step ON step."taskId" = task."id"
       WHERE step."id" = $1
       FOR UPDATE OF task`,
      [taskStepId],
    );
    const currentTask = task.rows[0];
    if (!currentTask) {
      throw new Error("Task step does not exist.");
    }
    if (currentTask.status === "CANCELLED" || currentTask.cancellationRequestedAt) {
      await client.query(
        `UPDATE "T0TaskStep" SET "status" = 'CANCELLED', "updatedAt" = NOW()
         WHERE "id" = $1 AND "status" = 'RUNNING'`,
        [taskStepId],
      );
      await client.query(
        `UPDATE "T0TaskStepAttempt" SET "status" = 'CANCELLED', "completedAt" = NOW()
         WHERE "taskStepId" = $1 AND "workerId" = $2 AND "status" = 'RUNNING'`,
        [taskStepId, workerId],
      );
      await client.query("COMMIT");
      return "CANCELLED";
    }

    const step = await client.query<{ id: string }>(
      `SELECT "id" FROM "T0TaskStep"
       WHERE "id" = $1 AND "leaseOwner" = $2 AND "status" = 'RUNNING'
       FOR UPDATE`,
      [taskStepId, workerId],
    );
    if (!step.rows[0]) {
      throw new Error("Worker no longer owns this step lease.");
    }
    await client.query(
      `UPDATE "T0TaskStep" SET "status" = 'SUCCEEDED', "leaseOwner" = NULL,
       "leaseExpiresAt" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
      [taskStepId],
    );
    await client.query(
      `UPDATE "T0TaskStepAttempt" SET "status" = 'SUCCEEDED', "completedAt" = NOW()
       WHERE "taskStepId" = $1 AND "workerId" = $2 AND "status" = 'RUNNING'`,
      [taskStepId, workerId],
    );
    await client.query(
      `UPDATE "T0Task" SET "status" = 'SUCCEEDED', "statusVersion" = "statusVersion" + 1,
       "updatedAt" = NOW() WHERE "id" = $1`,
      [currentTask.id],
    );
    await client.query("COMMIT");
    return "SUCCEEDED";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function requestCancellation(pool: Pool, taskId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const task = await client.query<{ status: string }>(
      `SELECT "status" FROM "T0Task" WHERE "id" = $1 FOR UPDATE`,
      [taskId],
    );
    const currentTask = task.rows[0];
    if (!currentTask || ["SUCCEEDED", "FAILED", "CANCELLED"].includes(currentTask.status)) {
      await client.query("COMMIT");
      return false;
    }
    await client.query(
      `UPDATE "T0Task" SET "status" = 'CANCELLED', "cancellationRequestedAt" = NOW(),
       "statusVersion" = "statusVersion" + 1, "updatedAt" = NOW() WHERE "id" = $1`,
      [taskId],
    );
    await client.query(
      `UPDATE "T0TaskStep" SET "status" = 'CANCELLED', "leaseOwner" = NULL,
       "leaseExpiresAt" = NULL, "updatedAt" = NOW()
       WHERE "taskId" = $1 AND "status" IN ('QUEUED', 'RUNNING')`,
      [taskId],
    );
    await client.query(
      `UPDATE "T0TaskStepAttempt" AS attempt SET "status" = 'CANCELLED', "completedAt" = NOW()
       FROM "T0TaskStep" AS step
       WHERE attempt."taskStepId" = step."id" AND step."taskId" = $1
       AND attempt."status" = 'RUNNING'`,
      [taskId],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function failLeasedStep(
  pool: Pool,
  taskStepId: string,
  workerId: string,
  maxAttempts: number,
): Promise<"QUEUED" | "FAILED"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const step = await client.query<{ taskId: string; currentAttempt: number }>(
      `SELECT "taskId", "currentAttempt" FROM "T0TaskStep"
       WHERE "id" = $1 AND "leaseOwner" = $2 AND "status" = 'RUNNING' FOR UPDATE`,
      [taskStepId, workerId],
    );
    const currentStep = step.rows[0];
    if (!currentStep) {
      throw new Error("Worker no longer owns this step lease.");
    }
    const nextStatus = currentStep.currentAttempt >= maxAttempts ? "FAILED" : "QUEUED";
    await client.query(
      `UPDATE "T0TaskStep" SET "status" = $2::"T0StepStatus", "leaseOwner" = NULL,
       "leaseExpiresAt" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
      [taskStepId, nextStatus],
    );
    await client.query(
      `UPDATE "T0TaskStepAttempt" SET "status" = 'FAILED', "completedAt" = NOW()
       WHERE "taskStepId" = $1 AND "workerId" = $2 AND "status" = 'RUNNING'`,
      [taskStepId, workerId],
    );
    if (nextStatus === "FAILED") {
      await client.query(
        `UPDATE "T0Task" SET "status" = 'FAILED', "statusVersion" = "statusVersion" + 1,
         "updatedAt" = NOW() WHERE "id" = $1`,
        [currentStep.taskId],
      );
    }
    await client.query("COMMIT");
    return nextStatus;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
