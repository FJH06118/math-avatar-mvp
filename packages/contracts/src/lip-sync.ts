import { z } from "zod";

import { Sha256Schema, StableIdSchema } from "./primitives";

export const LipPoseSchema = z.enum(["CLOSED", "SMALL", "MEDIUM", "LARGE", "ROUND"]);
export const LipSyncModeSchema = z.enum(["BOUNDARY_ENERGY", "ENERGY_ONLY"]);
export const LipSyncFpsSchema = z.union([z.literal(12), z.literal(25), z.literal(30)]);

export const WordBoundarySchema = z.object({
  text: z.string().min(1).max(1_000),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
}).strict().refine((value) => value.endMs > value.startMs, {
  message: "词边界结束时间必须晚于开始时间",
  path: ["endMs"],
});

export const WordTimingCaptureSchema = z.object({
  schemaVersion: z.literal("word-timing-v1"),
  captureVersion: z.literal("edge-word-boundary-v1"),
  status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  provider: z.literal("edge-tts"),
  reason: z.string().min(1).max(256).optional(),
  boundaries: z.array(WordBoundarySchema),
}).strict().superRefine((value, context) => {
  if (value.status === "AVAILABLE" && value.boundaries.length === 0) {
    context.addIssue({ code: "custom", path: ["boundaries"], message: "AVAILABLE 必须包含词边界" });
  }
  if (value.status === "UNAVAILABLE" && value.boundaries.length !== 0) {
    context.addIssue({ code: "custom", path: ["boundaries"], message: "UNAVAILABLE 不得包含词边界" });
  }
  if (value.status === "UNAVAILABLE" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "UNAVAILABLE 必须记录原因" });
  }
  for (let index = 0; index < value.boundaries.length; index += 1) {
    const current = value.boundaries[index];
    const previous = value.boundaries[index - 1];
    if (previous && current.startMs < previous.endMs) {
      context.addIssue({ code: "custom", path: ["boundaries", index, "startMs"], message: "词边界不得重叠或逆序" });
    }
  }
});

export const LipSyncRunSchema = z.object({
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().positive(),
  pose: LipPoseSchema,
}).strict().refine((value) => value.endFrame > value.startFrame, {
  message: "run 必须至少覆盖一帧",
  path: ["endFrame"],
});

export const LipSyncStatisticsSchema = z.object({
  poseFrameCounts: z.object({
    CLOSED: z.number().int().min(0),
    SMALL: z.number().int().min(0),
    MEDIUM: z.number().int().min(0),
    LARGE: z.number().int().min(0),
    ROUND: z.number().int().min(0),
  }).strict(),
  boundaryCount: z.number().int().min(0),
  boundaryCoverage: z.number().min(0).max(1),
  roundCoverage: z.number().min(0).max(1),
  maximumOpeningStep: z.number().int().min(0).max(1),
  longestSilenceCloseResponseMs: z.number().int().min(0),
}).strict();

const OPENING_LEVEL: Record<z.infer<typeof LipPoseSchema>, number> = {
  CLOSED: 0,
  SMALL: 1,
  MEDIUM: 2,
  LARGE: 3,
  ROUND: 2,
};

export const LipSyncTimelineSchema = z.object({
  schemaVersion: z.literal("lip-sync-timeline-v1"),
  driverVersion: z.string().min(1).max(128),
  configVersion: z.string().min(1).max(128),
  fps: LipSyncFpsSchema,
  durationMs: z.number().int().positive(),
  totalFrames: z.number().int().positive(),
  mode: LipSyncModeSchema,
  runs: z.array(LipSyncRunSchema).min(1),
  inputHash: Sha256Schema,
  timelineHash: Sha256Schema,
  statistics: LipSyncStatisticsSchema,
}).strict().superRefine((timeline, context) => {
  const expectedFrames = Math.round((timeline.durationMs * timeline.fps) / 1_000);
  if (Math.abs(timeline.totalFrames - expectedFrames) > 1) {
    context.addIssue({ code: "custom", path: ["totalFrames"], message: "时间轴与音频时长误差不得超过一帧" });
  }
  if (timeline.runs[0]?.startFrame !== 0) {
    context.addIssue({ code: "custom", path: ["runs", 0, "startFrame"], message: "时间轴必须从第 0 帧开始" });
  }
  for (let index = 0; index < timeline.runs.length; index += 1) {
    const current = timeline.runs[index];
    const previous = timeline.runs[index - 1];
    if (current.endFrame > timeline.totalFrames) {
      context.addIssue({ code: "custom", path: ["runs", index, "endFrame"], message: "run 不得越界" });
    }
    if (previous) {
      if (current.startFrame !== previous.endFrame) {
        context.addIssue({ code: "custom", path: ["runs", index, "startFrame"], message: "run 必须连续且不得重叠" });
      }
      if (current.pose === previous.pose) {
        context.addIssue({ code: "custom", path: ["runs", index, "pose"], message: "相邻相同 pose 必须合并" });
      }
      if (Math.abs(OPENING_LEVEL[current.pose] - OPENING_LEVEL[previous.pose]) > 1) {
        context.addIssue({ code: "custom", path: ["runs", index, "pose"], message: "相邻帧不得跨越一个以上开合等级" });
      }
    }
  }
  if (timeline.runs.at(-1)?.endFrame !== timeline.totalFrames) {
    context.addIssue({ code: "custom", path: ["runs"], message: "最后一个 run 必须覆盖全部帧" });
  }
  if (timeline.mode === "ENERGY_ONLY" && timeline.runs.some((run) => run.pose === "ROUND")) {
    context.addIssue({ code: "custom", path: ["runs"], message: "ENERGY_ONLY 不得包含 ROUND" });
  }
  const counted = timeline.runs.reduce((sum, run) => sum + run.endFrame - run.startFrame, 0);
  if (counted !== timeline.totalFrames) {
    context.addIssue({ code: "custom", path: ["runs"], message: "run 帧数总和必须等于 totalFrames" });
  }
});

const BoxSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();

const PngAssetSchema = z.object({
  path: z.string().min(1).max(512),
  sha256: Sha256Schema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  channels: z.literal(4),
  hasAlpha: z.literal(true),
}).strict();

const MouthPoseAssetSchema = PngAssetSchema.extend({
  openingLevel: z.number().min(0).max(1),
  derivation: z.string().min(1).max(512),
}).strict();

export const AvatarMouthManifestSchema = z.object({
  schemaVersion: z.literal("avatar-mouth-manifest-v1"),
  avatarId: StableIdSchema,
  displayName: z.string().min(1).max(100),
  assetVersion: z.string().min(1).max(128),
  status: z.literal("asset-ready"),
  rights: z.object({
    status: z.literal("confirmed-by-user"),
    confirmedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    scope: z.array(z.enum(["project-use", "derived-mouth-poses"])).min(2),
  }).strict(),
  canvas: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  anchor: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).strict(),
  faceSafeBox: BoxSchema,
  mouthRoi: BoxSchema,
  base: PngAssetSchema,
  poses: z.object({
    CLOSED: MouthPoseAssetSchema,
    SMALL: MouthPoseAssetSchema,
    MEDIUM: MouthPoseAssetSchema,
    LARGE: MouthPoseAssetSchema,
    ROUND: MouthPoseAssetSchema,
  }).strict(),
  provenance: z.object({
    baseSourcePath: z.string().min(1),
    baseSourceSha256: Sha256Schema,
    largeReferencePath: z.string().min(1),
    largeReferenceSha256: Sha256Schema,
    roundGenerator: z.string().min(1),
    roundSourceSha256: Sha256Schema,
    deterministicTransforms: z.string().min(1),
  }).strict(),
  bundleFingerprint: Sha256Schema,
}).strict().superRefine((manifest, context) => {
  const { canvas, faceSafeBox, mouthRoi, base, poses } = manifest;
  const within = (inner: z.infer<typeof BoxSchema>, outer: z.infer<typeof BoxSchema>) =>
    inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
  if (!within(mouthRoi, faceSafeBox)) context.addIssue({ code: "custom", path: ["mouthRoi"], message: "嘴部 ROI 必须位于脸部安全框内" });
  if (mouthRoi.x + mouthRoi.width > canvas.width || mouthRoi.y + mouthRoi.height > canvas.height) {
    context.addIssue({ code: "custom", path: ["mouthRoi"], message: "嘴部 ROI 不得越过画布" });
  }
  if (base.width !== canvas.width || base.height !== canvas.height) context.addIssue({ code: "custom", path: ["base"], message: "底图尺寸必须等于画布" });
  for (const [pose, asset] of Object.entries(poses)) {
    if (asset.width !== mouthRoi.width || asset.height !== mouthRoi.height) context.addIssue({ code: "custom", path: ["poses", pose], message: "嘴贴片尺寸必须等于 ROI" });
  }
});

export const AvatarCatalogSchema = z.object({
  schemaVersion: z.literal("avatar-catalog-v1"),
  avatars: z.array(z.object({
    avatarId: StableIdSchema,
    assetVersion: z.string().min(1).max(128),
    status: z.literal("asset-ready"),
    manifestPath: z.string().min(1).max(512),
    bundleFingerprint: Sha256Schema,
  }).strict()).min(1),
}).strict();

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export type LipPose = z.infer<typeof LipPoseSchema>;
export type WordTimingCapture = z.infer<typeof WordTimingCaptureSchema>;
export type LipSyncTimeline = z.infer<typeof LipSyncTimelineSchema>;
export type AvatarMouthManifest = z.infer<typeof AvatarMouthManifestSchema>;
export type AvatarCatalog = z.infer<typeof AvatarCatalogSchema>;
