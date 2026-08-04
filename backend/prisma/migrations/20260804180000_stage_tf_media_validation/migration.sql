CREATE TABLE "MediaOutput" (
  "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "renderTaskId" TEXT NOT NULL, "audioTaskId" TEXT NOT NULL,
  "videoAssetId" TEXT NOT NULL, "captionsAssetId" TEXT NOT NULL, "totalDurationMs" INTEGER NOT NULL,
  "fps" INTEGER NOT NULL, "status" TEXT NOT NULL, "inputHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaOutput_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MediaValidationRecord" (
  "id" TEXT NOT NULL, "outputId" TEXT NOT NULL, "status" TEXT NOT NULL, "report" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaValidationRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaOutput_taskId_key" ON "MediaOutput"("taskId");
CREATE UNIQUE INDEX "MediaValidationRecord_outputId_key" ON "MediaValidationRecord"("outputId");
ALTER TABLE "MediaOutput" ADD CONSTRAINT "MediaOutput_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaOutput" ADD CONSTRAINT "MediaOutput_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaOutput" ADD CONSTRAINT "MediaOutput_captionsAssetId_fkey" FOREIGN KEY ("captionsAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaValidationRecord" ADD CONSTRAINT "MediaValidationRecord_outputId_fkey" FOREIGN KEY ("outputId") REFERENCES "MediaOutput"("id") ON DELETE CASCADE ON UPDATE CASCADE;
