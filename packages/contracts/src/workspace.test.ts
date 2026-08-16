import { describe, expect, it } from "vitest";

import { WorkspaceLockInputSchema, WorkspaceSnapshotResponseSchema } from "./workspace";

describe("stage 6 workspace contracts", () => {
  it("accepts an original-page workspace snapshot", () => {
    const parsed = WorkspaceSnapshotResponseSchema.parse({
      data: {
        slides: [{
          parsed: {
            id: "slide_stage6_1",
            projectId: "project_stage6",
            presentationId: "presentation_stage6",
            slideNumber: 1,
            title: "导数定义",
            slideType: "concept",
            extractedText: "导数是变化率。",
            formulaCount: 0,
            formulas: [],
            parseConfidence: 0.99,
            parseWarnings: [],
            originalPage: {
              assetId: "asset_stage6_page_1",
              url: "/api/t/assets/asset_stage6_page_1/preview",
            },
          },
          isLocked: false,
        }],
      },
      meta: { requestId: "request_stage6", inputVersion: "v1", outputVersion: "v1" },
    });
    expect(parsed.data.slides[0]?.parsed.originalPage.assetId).toBe("asset_stage6_page_1");
  });

  it("requires optimistic revision data and rejects unknown lock fields", () => {
    expect(WorkspaceLockInputSchema.parse({ expectedRevision: 2, locked: true })).toEqual({
      expectedRevision: 2,
      locked: true,
    });
    expect(
      WorkspaceLockInputSchema.safeParse({ expectedRevision: 2, locked: true, force: true }).success,
    ).toBe(false);
  });
});
