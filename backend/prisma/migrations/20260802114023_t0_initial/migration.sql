-- CreateEnum
CREATE TYPE "T0TaskStatus" AS ENUM ('CREATED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "T0StepStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "T0AttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "T0Task" (
    "id" TEXT NOT NULL,
    "principal" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" "T0TaskStatus" NOT NULL DEFAULT 'CREATED',
    "cancellationRequestedAt" TIMESTAMP(3),
    "statusVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "T0Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "T0Outbox" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "T0Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "T0TaskStep" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "slideId" TEXT,
    "status" "T0StepStatus" NOT NULL DEFAULT 'QUEUED',
    "currentAttempt" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "T0TaskStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "T0TaskStepAttempt" (
    "id" TEXT NOT NULL,
    "taskStepId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "T0AttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "T0TaskStepAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "T0Task_principal_kind_idempotencyKey_key" ON "T0Task"("principal", "kind", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "T0Outbox_eventKey_key" ON "T0Outbox"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "T0TaskStepAttempt_taskStepId_attempt_key" ON "T0TaskStepAttempt"("taskStepId", "attempt");

-- AddForeignKey
ALTER TABLE "T0Outbox" ADD CONSTRAINT "T0Outbox_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "T0Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "T0TaskStep" ADD CONSTRAINT "T0TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "T0Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "T0TaskStepAttempt" ADD CONSTRAINT "T0TaskStepAttempt_taskStepId_fkey" FOREIGN KEY ("taskStepId") REFERENCES "T0TaskStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
