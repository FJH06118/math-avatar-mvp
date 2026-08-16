import { describe, expect, it } from "vitest";

import {
  ApprovedLessonPlanRevisionSchema,
  ApiErrorSchema,
  BaseSlideSchema,
  GenerateTaskInputSchema,
  LessonPlanRevisionSchema,
  SceneSchema,
  SignedDownloadSchema,
  createApprovedLessonPlanRevisionSchema,
} from "./index";

const baseScene = {
  id: "scene-1",
  sourceSlides: ["slide-1"],
  baseSlide: {
    sourceAssetId: "asset-slide-1",
    preservationMode: "FULL_PRESERVE" as const,
    fit: "contain" as const,
    mustShowFullSlide: true,
    fullSlideDurationMs: 1_500,
    fullRedesignAuthorizedByUser: false,
  },
  durationMs: 4_000,
  isSkipped: false,
};

const revision = {
  id: "revision-1",
  lessonPlanId: "lesson-plan-1",
  slideId: "slide-1",
  revision: 1,
  teachingGoal: "理解函数极限的直观含义",
  narration: [
    {
      id: "narration-1",
      displayText: "观察函数值的变化。",
      spokenText: "请观察函数值如何逐渐接近目标。",
    },
  ],
  derivation: [],
  scenes: [baseScene],
  sourceSlideCoverage: ["slide-1"],
  preservationMode: "FULL_PRESERVE" as const,
  estimatedDurationMs: 4_000,
  modelProvider: "rule",
  modelName: "deterministic",
  promptVersion: "prompt-v1",
  schemaVersion: "v1",
  inputHash: "input-hash",
  outputHash: "output-hash",
  createdBy: "rule" as const,
  createdAt: "2026-08-01T00:00:00.000Z",
  approval: {
    status: "approved" as const,
    approvedBy: "user-1",
    approvedAt: "2026-08-01T00:01:00.000Z",
  },
};

describe("shared contract hard gates", () => {
  it("rejects unknown fields on Agent output", () => {
    const result = LessonPlanRevisionSchema.safeParse({
      ...revision,
      unexpectedCommand: "ffmpeg -i input",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid IDs and executable-shaped overlay fields", () => {
    expect(
      BaseSlideSchema.safeParse({
        ...baseScene.baseSlide,
        sourceAssetId: "1",
      }).success,
    ).toBe(false);
    expect(
      SceneSchema.safeParse({
        ...baseScene,
        overlay: {
          id: "overlay-1",
          slideId: "slide-1",
          type: "callout",
          bounds: { x: 0, y: 0, width: 0.2, height: 0.2 },
          text: "safe",
          script: "eval(userInput)",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects unauthorized full redesign and incomplete original-page scenes", () => {
    expect(
      BaseSlideSchema.safeParse({
        ...baseScene.baseSlide,
        preservationMode: "FULL_REDESIGN",
      }).success,
    ).toBe(false);
    expect(
      SceneSchema.safeParse({
        ...baseScene,
        baseSlide: { ...baseScene.baseSlide, mustShowFullSlide: false },
      }).success,
    ).toBe(false);
  });

  it("rejects stale coverage copied from an earlier scene plan", () => {
    const result = LessonPlanRevisionSchema.safeParse({
      ...revision,
      scenes: [
        baseScene,
        {
          ...baseScene,
          id: "scene-2",
          sourceSlides: ["slide-2"],
          baseSlide: { ...baseScene.baseSlide, sourceAssetId: "asset-slide-2" },
        },
      ],
      sourceSlideCoverage: ["slide-1"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing required coverage and unapproved revisions", () => {
    const coverageResult = createApprovedLessonPlanRevisionSchema([
      "slide-1",
      "slide-2",
    ]).safeParse(revision);
    expect(coverageResult.success).toBe(false);

    const unapprovedRevision = {
      ...revision,
      approval: { status: "pending" as const },
    };
    expect(
      ApprovedLessonPlanRevisionSchema.safeParse(unapprovedRevision).success,
    ).toBe(false);
    expect(
      GenerateTaskInputSchema.safeParse({
        projectId: "project-1",
        presentationId: "presentation-1",
        idempotencyKey: "idempotency-1",
        approvedRevision: unapprovedRevision,
        settings: {
          avatarId: "avatar-1",
          voiceId: "voice-1",
          speechRate: 1,
          captionsEnabled: true,
          captionStyle: "clear",
          avatarPosition: "right",
          background: "light",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects internal paths from public download responses", () => {
    expect(
      SignedDownloadSchema.safeParse({
        assetId: "asset-1",
        url: "file:///var/lib/video.mp4",
        expiresAt: "2026-08-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      ApiErrorSchema.safeParse({
        error: {
          code: "INTERNAL",
          message: "failed",
          retryable: false,
          details: {},
          stack: "secret stack",
        },
        meta: {
          requestId: "request-1",
          inputVersion: "v1",
          outputVersion: "v1",
        },
      }).success,
    ).toBe(false);
  });
});
