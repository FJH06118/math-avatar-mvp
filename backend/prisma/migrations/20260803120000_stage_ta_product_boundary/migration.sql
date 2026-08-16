-- Stage T-A product records are intentionally separate from the T0 proof tables.
CREATE TYPE "ProjectLifecycle" AS ENUM ('DRAFT', 'PARSING', 'READY', 'FAILED');
CREATE TYPE "PresentationParseLifecycle" AS ENUM ('PENDING', 'PARSING', 'COMPLETED', 'FAILED');
CREATE TYPE "AssetLifecycle" AS ENUM ('AVAILABLE', 'INVALID', 'ORPHANED');
CREATE TYPE "GenerationTaskStatus" AS ENUM ('CREATED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "GenerationTaskStage" AS ENUM ('PARSE', 'PLAN', 'AUDIO', 'PAGE_RENDER', 'COMPOSITE', 'VALIDATE');

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "principal" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "ProjectLifecycle" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "taskId" TEXT,
  "kind" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "lifecycle" "AssetLifecycle" NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Presentation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "slideCount" INTEGER NOT NULL DEFAULT 0,
  "width" DOUBLE PRECISION,
  "height" DOUBLE PRECISION,
  "aspectRatio" DOUBLE PRECISION,
  "parseStatus" "PresentationParseLifecycle" NOT NULL DEFAULT 'PENDING',
  "parserVersion" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationTask" (
  "id" TEXT NOT NULL,
  "principal" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "presentationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "configHash" TEXT NOT NULL,
  "status" "GenerationTaskStatus" NOT NULL DEFAULT 'CREATED',
  "stage" "GenerationTaskStage" NOT NULL DEFAULT 'PARSE',
  "progressCompleted" INTEGER NOT NULL DEFAULT 0,
  "progressTotal" INTEGER NOT NULL DEFAULT 1,
  "presentationRevision" INTEGER NOT NULL DEFAULT 1,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "cancellationRequestedAt" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "statusVersion" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GenerationTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskOutbox" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationTaskStep" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "stage" "GenerationTaskStage" NOT NULL,
  "slideId" TEXT,
  "status" "GenerationTaskStatus" NOT NULL DEFAULT 'QUEUED',
  "currentAttempt" INTEGER NOT NULL DEFAULT 0,
  "inputHash" TEXT NOT NULL,
  "outputHash" TEXT,
  "progressCompleted" INTEGER NOT NULL DEFAULT 0,
  "progressTotal" INTEGER NOT NULL DEFAULT 1,
  "workerId" TEXT,
  "heartbeatAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GenerationTaskStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_principal_updatedAt_idx" ON "Project"("principal", "updatedAt");
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");
CREATE UNIQUE INDEX "Asset_projectId_kind_sha256_key" ON "Asset"("projectId", "kind", "sha256");
CREATE UNIQUE INDEX "GenerationTask_principal_kind_idempotencyKey_key" ON "GenerationTask"("principal", "kind", "idempotencyKey");
CREATE INDEX "GenerationTask_principal_projectId_updatedAt_idx" ON "GenerationTask"("principal", "projectId", "updatedAt");
CREATE UNIQUE INDEX "TaskOutbox_eventKey_key" ON "TaskOutbox"("eventKey");
CREATE UNIQUE INDEX "GenerationTaskStep_task_stage_without_slide_key"
  ON "GenerationTaskStep"("taskId", "stage") WHERE "slideId" IS NULL;
CREATE UNIQUE INDEX "GenerationTaskStep_task_stage_with_slide_key"
  ON "GenerationTaskStep"("taskId", "stage", "slideId") WHERE "slideId" IS NOT NULL;

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GenerationTask" ADD CONSTRAINT "GenerationTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationTask" ADD CONSTRAINT "GenerationTask_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskOutbox" ADD CONSTRAINT "TaskOutbox_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationTaskStep" ADD CONSTRAINT "GenerationTaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
