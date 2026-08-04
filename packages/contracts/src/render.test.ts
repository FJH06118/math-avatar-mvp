import { describe, expect, it } from "vitest";
import { RenderedPageSchema, RenderTaskCreateRequestSchema } from "./render";

describe("stage T-E render contract", () => {
  it("accepts a frozen page render request and result", () => {
    expect(RenderTaskCreateRequestSchema.safeParse({ presentationId: "presentation_1", audioTaskId: "task_audio_1", idempotencyKey: "render-key-1", fps: 25 }).success).toBe(true);
    expect(RenderedPageSchema.safeParse({
      id: "rendered_page_1", taskId: "task_render_1", slideId: "slide_1", revisionId: "revision_1",
      pageOrder: 1, durationMs: 1_600, fps: 25, width: 1920, height: 1080,
      frameAssetId: "asset_frame_1", videoAssetId: "asset_video_1",
      frameSha256: "a".repeat(64), videoSha256: "b".repeat(64), avatarPlacement: "right-panel",
      overlayType: "highlightBox",
    }).success).toBe(true);
  });

  it("rejects unsupported fps and short pages", () => {
    expect(RenderTaskCreateRequestSchema.safeParse({ presentationId: "presentation_1", audioTaskId: "task_audio_1", idempotencyKey: "render-key-1", fps: 12 }).success).toBe(false);
    expect(RenderedPageSchema.safeParse({}).success).toBe(false);
  });
});
