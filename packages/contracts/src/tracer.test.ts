import { describe, expect, it } from "vitest";
import { PresentationSchema, TracerUploadMetadataSchema } from "./index";

const pendingPresentation = {
  id: "presentation-tracer",
  projectId: "project-tracer",
  sourceAssetId: "asset-source-tracer",
  originalFileName: "导数前三页.pptx",
  sha256: "a".repeat(64),
  fileSize: 1024,
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  slideCount: 0,
  parseStatus: "pending",
  parserVersion: "python-pptx-v0.1",
  revision: 1,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

describe("stage T tracer contracts", () => {
  it("allows unknown page geometry only while parsing is pending", () => {
    expect(PresentationSchema.safeParse(pendingPresentation).success).toBe(true);
    expect(
      PresentationSchema.safeParse({ ...pendingPresentation, parseStatus: "completed" }).success,
    ).toBe(false);
  });

  it("accepts a bounded PPTX upload and rejects paths or legacy PPT", () => {
    const valid = {
      title: "导数的概念",
      fileName: "导数前三页.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileSize: 1024,
      idempotencyKey: "upload-tracer-001",
    };
    expect(TracerUploadMetadataSchema.safeParse(valid).success).toBe(true);
    expect(TracerUploadMetadataSchema.safeParse({ ...valid, fileName: "D:\\课件.pptx" }).success).toBe(false);
    expect(TracerUploadMetadataSchema.safeParse({ ...valid, fileName: "课件.ppt" }).success).toBe(false);
  });
});
