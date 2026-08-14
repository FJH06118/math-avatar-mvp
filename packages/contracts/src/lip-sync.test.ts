import { describe, expect, it } from "vitest";

import { AvatarCatalogSchema, LipSyncTimelineSchema, WordTimingCaptureSchema, canonicalJson } from "./lip-sync";

const hash = "a".repeat(64);
const timeline = {
  schemaVersion: "lip-sync-timeline-v1",
  driverVersion: "lip-sync-driver-v1",
  configVersion: "lip-sync-config-v1",
  fps: 25,
  durationMs: 400,
  totalFrames: 10,
  mode: "ENERGY_ONLY",
  runs: [
    { startFrame: 0, endFrame: 2, pose: "CLOSED" },
    { startFrame: 2, endFrame: 4, pose: "SMALL" },
    { startFrame: 4, endFrame: 7, pose: "MEDIUM" },
    { startFrame: 7, endFrame: 9, pose: "SMALL" },
    { startFrame: 9, endFrame: 10, pose: "CLOSED" },
  ],
  inputHash: hash,
  timelineHash: hash,
  statistics: {
    poseFrameCounts: { CLOSED: 3, SMALL: 4, MEDIUM: 3, LARGE: 0, ROUND: 0 },
    boundaryCount: 0,
    boundaryCoverage: 0,
    roundCoverage: 0,
    maximumOpeningStep: 1,
    longestSilenceCloseResponseMs: 80,
  },
} as const;

describe("lip-sync contracts", () => {
  it("accepts a strict contiguous deterministic timeline", () => {
    expect(LipSyncTimelineSchema.parse(timeline).totalFrames).toBe(10);
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe(canonicalJson({ a: { x: 3, y: 2 }, z: 1 }));
  });

  it.each([
    ["unknown field", { ...timeline, surprise: true }],
    ["gap", { ...timeline, runs: timeline.runs.map((run, index) => index === 1 ? { ...run, startFrame: 3 } : run) }],
    ["overlap", { ...timeline, runs: timeline.runs.map((run, index) => index === 1 ? { ...run, startFrame: 1 } : run) }],
    ["out of bounds", { ...timeline, runs: timeline.runs.map((run, index) => index === 4 ? { ...run, endFrame: 11 } : run) }],
    ["opening jump", { ...timeline, runs: [{ startFrame: 0, endFrame: 2, pose: "CLOSED" }, { startFrame: 2, endFrame: 10, pose: "LARGE" }] }],
    ["energy-only round", { ...timeline, runs: [{ startFrame: 0, endFrame: 2, pose: "CLOSED" }, { startFrame: 2, endFrame: 8, pose: "ROUND" }, { startFrame: 8, endFrame: 10, pose: "CLOSED" }] }],
  ])("rejects %s", (_name, value) => {
    expect(LipSyncTimelineSchema.safeParse(value).success).toBe(false);
  });

  it("validates available and unavailable timing without inventing boundaries", () => {
    expect(WordTimingCaptureSchema.safeParse({ schemaVersion: "word-timing-v1", captureVersion: "edge-word-boundary-v1", status: "AVAILABLE", provider: "edge-tts", boundaries: [{ text: "函数", startMs: 10, endMs: 200 }] }).success).toBe(true);
    expect(WordTimingCaptureSchema.safeParse({ schemaVersion: "word-timing-v1", captureVersion: "edge-word-boundary-v1", status: "UNAVAILABLE", provider: "edge-tts", reason: "SIDECAR_MISSING", boundaries: [] }).success).toBe(true);
    expect(WordTimingCaptureSchema.safeParse({ schemaVersion: "word-timing-v1", captureVersion: "edge-word-boundary-v1", status: "AVAILABLE", provider: "edge-tts", boundaries: [] }).success).toBe(false);
  });

  it("rejects catalog path/shape surprises before the asset loader", () => {
    expect(AvatarCatalogSchema.safeParse({ schemaVersion: "avatar-catalog-v1", avatars: [{ avatarId: "avatar-zhou", assetVersion: "mouth-v1", status: "asset-ready", manifestPath: "avatar-zhou/manifest.json", bundleFingerprint: hash }] }).success).toBe(true);
    expect(AvatarCatalogSchema.safeParse({ schemaVersion: "avatar-catalog-v1", avatars: [], extra: true }).success).toBe(false);
  });
});
