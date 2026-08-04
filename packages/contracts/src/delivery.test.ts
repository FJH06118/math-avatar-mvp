import { describe, expect, it } from "vitest";
import { DeliveryManifestSchema } from "./delivery";

describe("DeliveryManifestSchema", () => {
  it("accepts only a complete controlled delivery bundle", () => {
    const metadata = { schemaVersion: "stage-tg-delivery-v1", projectId: "project_123", presentationId: "presentation_123", taskId: "task_123", title: "导数", originalFileName: "lesson.pptx", slideCount: 3, totalDurationMs: 4950, fps: 25, validationStatus: "passed" };
    const file = (kind: "video" | "captions" | "metadata", assetId: string | null) => ({ kind, assetId, fileName: `${kind}.bin`, mimeType: "application/octet-stream", fileSize: 10, sha256: "a".repeat(64), downloadUrl: kind === "metadata" ? "/api/t/tasks/task_123/delivery/metadata" : `/api/t/assets/${assetId}` });
    expect(DeliveryManifestSchema.parse({ taskId: "task_123", metadata, files: [file("video", "asset_video"), file("captions", "asset_srt"), file("metadata", null)] }).files).toHaveLength(3);
    expect(() => DeliveryManifestSchema.parse({ taskId: "task_123", metadata, files: [file("video", "asset_video"), file("video", "asset_video2"), file("metadata", null)] })).toThrow();
  });
});
