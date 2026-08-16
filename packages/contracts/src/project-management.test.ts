import { describe, expect, it } from "vitest";

import {
  ProjectCopyInputSchema,
  ProjectListQuerySchema,
  ProjectResponseSchema,
  ProjectVersionInputSchema,
} from "./project";

const project = {
  id: "project_stage3",
  title: "导数课程",
  status: "archived",
  fileName: "导数课程.pptx",
  slideCount: 3,
  createdAt: "2026-08-04T00:00:00.000Z",
  updatedAt: "2026-08-04T01:00:00.000Z",
  uploadedFileId: "asset_source",
  settings: {
    avatarId: "avatar-lin",
    voiceId: "voice-qinghe",
    speechRate: 1,
    captionsEnabled: true,
    captionStyle: "clear",
    avatarPosition: "right",
    background: "light",
  },
  version: 2,
};

describe("stage 3 project management contracts", () => {
  it("accepts archived projects through the public response", () => {
    expect(
      ProjectResponseSchema.parse({
        data: project,
        meta: {
          requestId: "request_stage3",
          inputVersion: "v1",
          outputVersion: "v1",
        },
      }).data.status,
    ).toBe("archived");
  });

  it("normalizes project list filters and rejects unknown fields", () => {
    expect(ProjectListQuerySchema.parse({})).toEqual({
      search: "",
      includeArchived: false,
    });
    expect(
      ProjectListQuerySchema.safeParse({ search: "导数", unknown: true })
        .success,
    ).toBe(false);
  });

  it("requires stable idempotency and optimistic versions", () => {
    expect(
      ProjectCopyInputSchema.safeParse({
        title: "导数课程（副本）",
        idempotencyKey: "copy_stage3",
      }).success,
    ).toBe(true);
    expect(
      ProjectVersionInputSchema.safeParse({ expectedVersion: 0 }).success,
    ).toBe(false);
  });
});
