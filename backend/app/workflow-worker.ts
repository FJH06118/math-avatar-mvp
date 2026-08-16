import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { WorkflowOrchestrator } from "./workflow-orchestrator.ts";

export interface WorkflowClaim {
  workflowId: string;
}

export async function claimNextWorkflow(
  pool: Pool,
  workerId: string,
  leaseMs: number,
): Promise<WorkflowClaim | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(
      `WITH candidate AS (
         SELECT "id"
         FROM "WorkflowRun"
         WHERE "status" IN ('QUEUED', 'RUNNING')
           AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < NOW() OR "cancellationRequestedAt" IS NOT NULL)
         ORDER BY "updatedAt", "createdAt"
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE "WorkflowRun" AS run
       SET "status" = CASE WHEN run."cancellationRequestedAt" IS NULL THEN 'RUNNING' ELSE run."status" END,
           "leaseOwner" = $1,
           "leaseExpiresAt" = NOW() + ($2 * INTERVAL '1 millisecond'),
           "heartbeatAt" = NOW(),
           "startedAt" = COALESCE(run."startedAt", NOW()),
           "updatedAt" = NOW()
       FROM candidate
       WHERE run."id" = candidate."id"
       RETURNING run."id"`,
      [workerId, leaseMs],
    );
    const workflow = result.rows[0];
    await client.query("COMMIT");
    return workflow ? { workflowId: workflow.id } : null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function heartbeatWorkflowLease(
  pool: Pool,
  workflowId: string,
  workerId: string,
  leaseMs: number,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE "WorkflowRun"
     SET "leaseExpiresAt" = NOW() + ($3 * INTERVAL '1 millisecond'),
         "heartbeatAt" = NOW(),
         "updatedAt" = NOW()
     WHERE "id" = $1 AND "leaseOwner" = $2
       AND "status" IN ('QUEUED', 'RUNNING')
       AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" > NOW())
     RETURNING "id"`,
    [workflowId, workerId, leaseMs],
  );
  return result.rowCount === 1;
}

export async function runClaimedWorkflow(
  dependencies: { prisma: PrismaClient; orchestrator?: WorkflowOrchestrator },
  claim: WorkflowClaim,
  workerId: string,
): Promise<"WAITING" | "SUCCEEDED" | "FAILED" | "CANCELLED"> {
  const orchestrator = dependencies.orchestrator ?? new WorkflowOrchestrator(dependencies.prisma);
  return orchestrator.advance(claim.workflowId, workerId);
}

export function defaultWorkflowWorkerId(): string {
  return `workflow_worker_${randomUUID()}`;
}
