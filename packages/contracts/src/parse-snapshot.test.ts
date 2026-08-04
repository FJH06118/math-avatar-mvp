import { describe, expect, it } from "vitest";

import { ParseSnapshotResponseSchema } from "./parse";

const now = "2026-08-04T00:00:00.000Z";
const task = {
  id: "task_parse_stage5",
  projectId: "project_stage5",
  presentationId: "presentation_stage5",
  kind: "PARSE",
  status: "SUCCEEDED",
  stage: "PARSE",
  progressCompleted: 1,
  progressTotal: 1,
  idempotencyKey: "upload_stage5",
  inputHash: "a".repeat(64),
  configHash: "b".repeat(64),
  presentationRevision: 1,
  retryCount: 0,
  statusVersion: 2,
  completedAt: now,
  createdAt: now,
  updatedAt: now,
};

function slide(slideNumber: number) {
  return {
    id: `slide_stage5_${slideNumber}`,
    projectId: task.projectId,
    presentationId: task.presentationId,
    slideNumber,
    title: `第 ${slideNumber} 页`,
    slideType: "content",
    extractedText: "导数",
    formulaCount: 1,
    formulas: [{
      id: `formula_stage5_${slideNumber}`,
      latex: "f'(x)",
      spokenText: "f x 的导数",
      status: "warning" as const,
    }],
    parseConfidence: 0.98,
    parseWarnings: [],
    originalPage: {
      assetId: `asset_stage5_${slideNumber}`,
      url: `/api/t/assets/asset_stage5_${slideNumber}/preview`,
    },
  };
}

describe("stage 5 parse snapshot contract", () => {
  it("accepts stable slides with scoped original-page URLs", () => {
    const parsed = ParseSnapshotResponseSchema.parse({
      data: { task, slides: [slide(1)] },
      meta: { requestId: "request_stage5", inputVersion: "v1", outputVersion: "v1" },
    });
    expect(parsed.data.slides[0]?.originalPage.assetId).toBe("asset_stage5_1");
  });

  it("rejects gaps and reconstructed or external page URLs", () => {
    expect(
      ParseSnapshotResponseSchema.safeParse({
        data: { task, slides: [slide(2)] },
        meta: { requestId: "request_stage5", inputVersion: "v1", outputVersion: "v1" },
      }).success,
    ).toBe(false);
    expect(
      ParseSnapshotResponseSchema.safeParse({
        data: {
          task,
          slides: [{ ...slide(1), originalPage: { ...slide(1).originalPage, url: "https://example.com/page.png" } }],
        },
        meta: { requestId: "request_stage5", inputVersion: "v1", outputVersion: "v1" },
      }).success,
    ).toBe(false);
  });
});
