-- Stage T-B parse worker state and durable parsed slides.
CREATE TABLE "Slide" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "presentationId" TEXT NOT NULL,
  "slideNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "slideType" TEXT NOT NULL,
  "extractedText" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "formulaJson" JSONB NOT NULL,
  "renderAssetId" TEXT,
  "parseConfidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "parseWarnings" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Slide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskStepAttempt" (
  "id" TEXT NOT NULL,
  "taskStepId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "workerId" TEXT NOT NULL,
  "status" "GenerationTaskStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeatAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  CONSTRAINT "TaskStepAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Slide_presentationId_slideNumber_key" ON "Slide"("presentationId", "slideNumber");
CREATE INDEX "Slide_projectId_slideNumber_idx" ON "Slide"("projectId", "slideNumber");
CREATE UNIQUE INDEX "TaskStepAttempt_taskStepId_attempt_key" ON "TaskStepAttempt"("taskStepId", "attempt");

ALTER TABLE "Slide" ADD CONSTRAINT "Slide_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_renderAssetId_fkey" FOREIGN KEY ("renderAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskStepAttempt" ADD CONSTRAINT "TaskStepAttempt_taskStepId_fkey" FOREIGN KEY ("taskStepId") REFERENCES "GenerationTaskStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
