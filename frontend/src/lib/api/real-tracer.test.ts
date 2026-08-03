import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadTracerPresentation } from "./real-tracer";

afterEach(() => vi.unstubAllGlobals());

describe("real tracer API adapter", () => {
  it("validates and returns the public upload receipt", async () => {
    const now = "2026-08-03T00:00:00.000Z";
    const file = new File(["pptx"], "导数前三页.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const body = {
      data: {
        project: {
          id: "project-tracer",
          title: "导数的概念",
          status: "parsing",
          fileName: file.name,
          slideCount: 0,
          createdAt: now,
          updatedAt: now,
          uploadedFileId: "asset-source-tracer",
          parsingJobId: "task-parse-tracer",
          settings: {
            avatarId: "avatar-lin",
            voiceId: "voice-qinghe",
            speechRate: 1,
            captionsEnabled: true,
            captionStyle: "clear",
            avatarPosition: "right",
            background: "light",
          },
          version: 1,
        },
        presentation: {
          id: "presentation-tracer",
          projectId: "project-tracer",
          sourceAssetId: "asset-source-tracer",
          originalFileName: file.name,
          sha256: "a".repeat(64),
          fileSize: file.size,
          mimeType: file.type,
          slideCount: 0,
          parseStatus: "pending",
          parserVersion: "python-pptx-v0.1",
          revision: 1,
          createdAt: now,
          updatedAt: now,
        },
        task: {
          id: "task-parse-tracer",
          projectId: "project-tracer",
          presentationId: "presentation-tracer",
          kind: "PARSE",
          status: "QUEUED",
          stage: "PARSE",
          progressCompleted: 0,
          progressTotal: 1,
          idempotencyKey: "upload-tracer-001",
          inputHash: "a".repeat(64),
          configHash: "b".repeat(64),
          presentationRevision: 1,
          retryCount: 0,
          statusVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
        created: true,
      },
      meta: { requestId: "request-tracer", inputVersion: "v1", outputVersion: "v1" },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 201, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const receipt = await uploadTracerPresentation({
      title: "导数的概念",
      file,
      idempotencyKey: "upload-tracer-001",
    });

    expect(receipt.created).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/t/projects");
  });
});
