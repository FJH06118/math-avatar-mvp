CREATE TABLE "AudioSegment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "presentationId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "slideId" TEXT NOT NULL,
  "narrationId" TEXT NOT NULL,
  "slideOrder" INTEGER NOT NULL,
  "segmentOrder" INTEGER NOT NULL,
  "displayText" TEXT NOT NULL,
  "spokenText" TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "assetId" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "voice" TEXT NOT NULL,
  "rate" TEXT NOT NULL,
  "pitch" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AudioSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubtitleCue" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "audioSegmentId" TEXT NOT NULL,
  "cueIndex" INTEGER NOT NULL,
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubtitleCue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AudioTimelineRecord" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "srtAssetId" TEXT NOT NULL,
  "totalDurationMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AudioTimelineRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AudioSegment_taskId_narrationId_key" ON "AudioSegment"("taskId", "narrationId");
CREATE INDEX "AudioSegment_taskId_slideOrder_segmentOrder_idx" ON "AudioSegment"("taskId", "slideOrder", "segmentOrder");
CREATE INDEX "AudioSegment_projectId_presentationId_idx" ON "AudioSegment"("projectId", "presentationId");
CREATE UNIQUE INDEX "SubtitleCue_audioSegmentId_key" ON "SubtitleCue"("audioSegmentId");
CREATE UNIQUE INDEX "SubtitleCue_taskId_cueIndex_key" ON "SubtitleCue"("taskId", "cueIndex");
CREATE INDEX "SubtitleCue_taskId_startMs_idx" ON "SubtitleCue"("taskId", "startMs");
CREATE UNIQUE INDEX "AudioTimelineRecord_taskId_key" ON "AudioTimelineRecord"("taskId");

ALTER TABLE "AudioSegment" ADD CONSTRAINT "AudioSegment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioSegment" ADD CONSTRAINT "AudioSegment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "LessonPlanRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AudioSegment" ADD CONSTRAINT "AudioSegment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubtitleCue" ADD CONSTRAINT "SubtitleCue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubtitleCue" ADD CONSTRAINT "SubtitleCue_audioSegmentId_fkey" FOREIGN KEY ("audioSegmentId") REFERENCES "AudioSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioTimelineRecord" ADD CONSTRAINT "AudioTimelineRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioTimelineRecord" ADD CONSTRAINT "AudioTimelineRecord_srtAssetId_fkey" FOREIGN KEY ("srtAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
