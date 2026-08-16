CREATE TABLE "RenderedPage" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "slideId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "pageOrder" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "fps" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "frameAssetId" TEXT NOT NULL,
  "videoAssetId" TEXT NOT NULL,
  "frameSha256" TEXT NOT NULL,
  "videoSha256" TEXT NOT NULL,
  "avatarPlacement" TEXT NOT NULL,
  "overlayType" TEXT,
  "inputHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RenderedPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RenderedPage_taskId_slideId_key" ON "RenderedPage"("taskId", "slideId");
CREATE UNIQUE INDEX "RenderedPage_taskId_pageOrder_key" ON "RenderedPage"("taskId", "pageOrder");
CREATE INDEX "RenderedPage_taskId_pageOrder_idx" ON "RenderedPage"("taskId", "pageOrder");
ALTER TABLE "RenderedPage" ADD CONSTRAINT "RenderedPage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RenderedPage" ADD CONSTRAINT "RenderedPage_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "LessonPlanRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RenderedPage" ADD CONSTRAINT "RenderedPage_frameAssetId_fkey" FOREIGN KEY ("frameAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RenderedPage" ADD CONSTRAINT "RenderedPage_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
