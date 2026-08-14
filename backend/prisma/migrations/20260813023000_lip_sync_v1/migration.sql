ALTER TABLE "AudioSegment" ADD COLUMN "timingMetadata" JSONB;

ALTER TABLE "RenderedPage"
  ADD COLUMN "avatarId" TEXT NOT NULL DEFAULT 'avatar-zhou',
  ADD COLUMN "avatarAssetVersion" TEXT NOT NULL DEFAULT 'legacy-static-v1',
  ADD COLUMN "lipSyncTimeline" JSONB,
  ADD COLUMN "lipSyncTimelineHash" TEXT;
