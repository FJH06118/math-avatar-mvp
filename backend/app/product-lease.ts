import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface ProductClaim {
  taskId: string;
  taskStepId: string;
  attempt: number;
}

export async function claimNextProductStep(
  pool: Pool,
  workerId: string,
  leaseMs: number,
  maxAttempts = 3,
  stage: "PARSE" | "PLAN" | "AUDIO" | "PAGE_RENDER" | "COMPOSITE" | "VALIDATE" = "PARSE",
): Promise<ProductClaim | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claim = await client.query<{ id: string; taskId: string; currentAttempt: number }>(`
      WITH candidate AS (
        SELECT step."id"
        FROM "GenerationTaskStep" AS step
        INNER JOIN "GenerationTask" AS task ON task."id" = step."taskId"
        WHERE (
          step."status" = 'QUEUED'
          OR (step."status" = 'RUNNING' AND step."leaseExpiresAt" < NOW())
        )
        AND step."stage" = $4::"GenerationTaskStage"
        AND ($4::text NOT IN ('AUDIO', 'PAGE_RENDER', 'COMPOSITE', 'VALIDATE') OR NOT EXISTS (
          SELECT 1 FROM "GenerationTaskStep" AS active
          WHERE active."taskId" = step."taskId" AND active."stage" = 'AUDIO'
            AND active."status" = 'RUNNING' AND active."leaseExpiresAt" > NOW()
        ))
        AND step."currentAttempt" < $3
        AND task."cancellationRequestedAt" IS NULL
        AND task."status" NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
        ORDER BY step."createdAt"
        FOR UPDATE OF step SKIP LOCKED
        LIMIT 1
      )
      UPDATE "GenerationTaskStep" AS step
      SET "status" = 'RUNNING', "workerId" = $1,
          "leaseExpiresAt" = NOW() + ($2 * INTERVAL '1 millisecond'),
          "heartbeatAt" = NOW(), "startedAt" = COALESCE(step."startedAt", NOW()),
          "currentAttempt" = step."currentAttempt" + 1, "updatedAt" = NOW()
      FROM candidate
      WHERE step."id" = candidate."id"
      RETURNING step."id", step."taskId", step."currentAttempt"
    `, [workerId, leaseMs, maxAttempts, stage]);
    const step = claim.rows[0];
    if (!step) {
      await client.query("COMMIT");
      return null;
    }
    await client.query(
      `UPDATE "TaskStepAttempt" SET "status" = 'FAILED', "completedAt" = NOW(),
       "errorCode" = 'LEASE_EXPIRED', "errorMessage" = 'Worker lease expired.'
       WHERE "taskStepId" = $1 AND "status" = 'RUNNING'`,
      [step.id],
    );
    await client.query(
      `INSERT INTO "TaskStepAttempt"
       ("id", "taskStepId", "attempt", "workerId", "status", "heartbeatAt")
       VALUES ($1, $2, $3, $4, 'RUNNING', NOW())`,
      [randomUUID(), step.id, step.currentAttempt, workerId],
    );
    const taskUpdate = await client.query(
      `UPDATE "GenerationTask" SET "status" = 'RUNNING',
       "startedAt" = COALESCE("startedAt", NOW()), "heartbeatAt" = NOW(), "updatedAt" = NOW()
       WHERE "id" = $1
         AND "cancellationRequestedAt" IS NULL
         AND "status" IN ('CREATED', 'QUEUED', 'RUNNING')
       RETURNING "id"`,
      [step.taskId],
    );
    if (taskUpdate.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("COMMIT");
    return { taskId: step.taskId, taskStepId: step.id, attempt: step.currentAttempt };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function heartbeatProductLease(
  pool: Pool,
  claim: ProductClaim,
  workerId: string,
  leaseMs: number,
): Promise<boolean> {
  const result = await pool.query(
    `WITH updated AS (
       UPDATE "GenerationTaskStep" AS step
       SET "leaseExpiresAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
           "heartbeatAt" = NOW(), "updatedAt" = NOW()
       FROM "GenerationTask" AS task
       WHERE step."id" = $1 AND step."taskId" = task."id"
         AND step."workerId" = $2 AND step."currentAttempt" = $3
         AND step."status" = 'RUNNING' AND step."leaseExpiresAt" > NOW()
         AND task."cancellationRequestedAt" IS NULL
       RETURNING step."taskId"
     )
     UPDATE "GenerationTask" SET "heartbeatAt" = NOW(), "updatedAt" = NOW()
     WHERE "id" IN (SELECT "taskId" FROM updated)`,
    [claim.taskStepId, workerId, claim.attempt, leaseMs],
  );
  if (result.rowCount === 1) {
    await pool.query(
      `UPDATE "TaskStepAttempt" SET "heartbeatAt" = NOW()
       WHERE "taskStepId" = $1 AND "attempt" = $2 AND "workerId" = $3 AND "status" = 'RUNNING'`,
      [claim.taskStepId, claim.attempt, workerId],
    );
    return true;
  }
  return false;
}

export async function failProductStep(
  pool: Pool,
  claim: ProductClaim,
  workerId: string,
  errorCode: string,
  errorMessage: string,
  retryable: boolean,
  maxAttempts = 3,
): Promise<"QUEUED" | "FAILED" | "CANCELLED"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const step = await client.query<{
      taskId: string;
      currentAttempt: number;
      taskStatus: string;
      workerId: string | null;
      stepStatus: string;
      stage: string;
    }>(
      `SELECT step."taskId", step."currentAttempt", step."workerId", step."stage"::text AS "stage",
       step."status" AS "stepStatus", task."status" AS "taskStatus"
       FROM "GenerationTaskStep" AS step
       INNER JOIN "GenerationTask" AS task ON task."id" = step."taskId"
       WHERE step."id" = $1 FOR UPDATE OF step, task`,
      [claim.taskStepId],
    );
    const current = step.rows[0];
    if (!current || current.taskStatus === "CANCELLED") {
      await client.query("COMMIT");
      return "CANCELLED";
    }
    if (
      current.workerId !== workerId ||
      current.currentAttempt !== claim.attempt ||
      current.stepStatus !== "RUNNING"
    ) {
      await client.query("ROLLBACK");
      throw new Error("Worker no longer owns this product step lease.");
    }
    const next = retryable && current.currentAttempt < maxAttempts ? "QUEUED" : "FAILED";
    await client.query(
      `UPDATE "GenerationTaskStep" SET "status" = $4::"GenerationTaskStatus",
       "workerId" = NULL, "leaseExpiresAt" = NULL, "errorCode" = $2,
       "errorMessage" = $3, "updatedAt" = NOW()
       WHERE "id" = $1 AND "workerId" = $5 AND "currentAttempt" = $6`,
      [claim.taskStepId, errorCode, errorMessage, next, workerId, claim.attempt],
    );
    await client.query(
      `UPDATE "TaskStepAttempt" SET "status" = 'FAILED', "completedAt" = NOW(),
       "errorCode" = $3, "errorMessage" = $4
       WHERE "taskStepId" = $1 AND "attempt" = $2 AND "workerId" = $5 AND "status" = 'RUNNING'`,
      [claim.taskStepId, claim.attempt, errorCode, errorMessage, workerId],
    );
    await client.query(
      `UPDATE "GenerationTask" SET "status" = $2::"GenerationTaskStatus",
       "errorCode" = $3, "errorMessage" = $4,
       "retryCount" = GREATEST("retryCount", $5 - 1),
       "statusVersion" = "statusVersion" + 1, "updatedAt" = NOW()
       WHERE "id" = $1`,
      [current.taskId, next, errorCode, errorMessage, current.currentAttempt],
    );
    if (next === "FAILED" && current.stage === "PARSE") {
      await client.query(
        `UPDATE "Presentation" SET "parseStatus" = 'FAILED', "updatedAt" = NOW()
         WHERE "id" = (SELECT "presentationId" FROM "GenerationTask" WHERE "id" = $1)`,
        [current.taskId],
      );
      await client.query(
        `UPDATE "Project" SET "status" = 'FAILED', "updatedAt" = NOW()
         WHERE "id" = (SELECT "projectId" FROM "GenerationTask" WHERE "id" = $1)`,
        [current.taskId],
      );
    }
    await client.query("COMMIT");
    return next;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
