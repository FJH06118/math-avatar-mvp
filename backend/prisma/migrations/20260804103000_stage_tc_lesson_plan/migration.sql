-- Stage T-C durable lesson-plan revisions, normalized scenes, and approval audit fields.
CREATE TABLE "LessonPlan" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "presentationId" TEXT NOT NULL,
  "slideId" TEXT NOT NULL,
  "currentRevision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LessonPlanRevision" (
  "id" TEXT NOT NULL,
  "lessonPlanId" TEXT NOT NULL,
  "slideId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "inputHash" TEXT NOT NULL,
  "outputHash" TEXT NOT NULL,
  "modelProvider" TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonPlanRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlannedScene" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "slideId" TEXT NOT NULL,
  "sceneOrder" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlannedScene_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LessonPlan_slideId_key" ON "LessonPlan"("slideId");
CREATE INDEX "LessonPlan_projectId_presentationId_idx" ON "LessonPlan"("projectId", "presentationId");
CREATE UNIQUE INDEX "LessonPlanRevision_lessonPlanId_revision_key" ON "LessonPlanRevision"("lessonPlanId", "revision");
CREATE INDEX "LessonPlanRevision_slideId_createdAt_idx" ON "LessonPlanRevision"("slideId", "createdAt");
CREATE UNIQUE INDEX "PlannedScene_revisionId_sceneOrder_key" ON "PlannedScene"("revisionId", "sceneOrder");
CREATE INDEX "PlannedScene_slideId_idx" ON "PlannedScene"("slideId");

ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "Slide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlanRevision" ADD CONSTRAINT "LessonPlanRevision_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannedScene" ADD CONSTRAINT "PlannedScene_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "LessonPlanRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
