import { createHash } from "node:crypto";
import { DeliveryManifestSchema, DeliveryMetadataSchema } from "@ppt-digital-human/contracts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { AppHttpError } from "./errors.ts";

export class DeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getBundle(principal: string, taskId: string) {
    const task = await this.prisma.generationTask.findFirst({
      where: { id: taskId, principal, kind: "VALIDATE", status: "SUCCEEDED" },
      include: {
        project: true,
        presentation: true,
        mediaOutput: { include: { videoAsset: true, captionsAsset: true, validation: true } },
      },
    });
    const output = task?.mediaOutput;
    if (!task || !output || output.status !== "VALIDATED" || output.validation?.status !== "passed" || output.videoAsset.lifecycle !== "AVAILABLE" || output.captionsAsset.lifecycle !== "AVAILABLE") {
      throw new AppHttpError(404, "DELIVERY_NOT_FOUND", "交付内容不存在。", false);
    }
    const metadata = DeliveryMetadataSchema.parse({
      schemaVersion: "stage-tg-delivery-v1",
      projectId: task.projectId,
      presentationId: task.presentationId,
      taskId: task.id,
      title: task.project.title,
      originalFileName: task.presentation.originalFileName,
      slideCount: task.presentation.slideCount,
      totalDurationMs: output.totalDurationMs,
      fps: output.fps,
      validationStatus: "passed",
    });
    const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    const metadataSha = createHash("sha256").update(metadataBytes).digest("hex");
    return {
      manifest: DeliveryManifestSchema.parse({
        taskId: task.id,
        metadata,
        files: [
          { kind: "video", assetId: output.videoAsset.id, fileName: `video-${task.id}.mp4`, mimeType: output.videoAsset.mimeType, fileSize: output.videoAsset.fileSize, sha256: output.videoAsset.sha256, downloadUrl: `/api/t/assets/${output.videoAsset.id}` },
          { kind: "captions", assetId: output.captionsAsset.id, fileName: `captions-${task.id}.srt`, mimeType: output.captionsAsset.mimeType, fileSize: output.captionsAsset.fileSize, sha256: output.captionsAsset.sha256, downloadUrl: `/api/t/assets/${output.captionsAsset.id}` },
          { kind: "metadata", assetId: null, fileName: `metadata-${task.id}.json`, mimeType: "application/json; charset=utf-8", fileSize: metadataBytes.byteLength, sha256: metadataSha, downloadUrl: `/api/t/tasks/${task.id}/delivery/metadata` },
        ],
      }),
      metadataBytes,
      metadataSha,
    };
  }

  async getDeliverableAsset(principal: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, lifecycle: "AVAILABLE", project: { principal } } });
    if (!asset) throw new AppHttpError(404, "ASSET_NOT_FOUND", "交付资产不存在。", false);
    const output = await this.prisma.mediaOutput.findFirst({
      where: { status: "VALIDATED", task: { principal, status: "SUCCEEDED" }, OR: [{ videoAssetId: asset.id }, { captionsAssetId: asset.id }] },
      select: { id: true },
    });
    if (!output) throw new AppHttpError(404, "ASSET_NOT_FOUND", "交付资产不存在。", false);
    return asset;
  }
}
