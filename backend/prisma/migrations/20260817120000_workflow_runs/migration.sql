CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "principal" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "currentStage" TEXT NOT NULL DEFAULT 'AUDIO',
    "progressCompleted" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 1,
    "currentSlideId" TEXT,
    "planTaskId" TEXT,
    "audioTaskId" TEXT,
    "renderTaskId" TEXT,
    "compositeTaskId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryIdempotencyKey" TEXT,
    "cancellationRequestedAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "statusVersion" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowRun_principal_idempotencyKey_key" ON "WorkflowRun"("principal", "idempotencyKey");
CREATE INDEX "WorkflowRun_principal_projectId_updatedAt_idx" ON "WorkflowRun"("principal", "projectId", "updatedAt");
CREATE INDEX "WorkflowRun_status_leaseExpiresAt_updatedAt_idx" ON "WorkflowRun"("status", "leaseExpiresAt", "updatedAt");

ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_presentationId_fkey"
  FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
