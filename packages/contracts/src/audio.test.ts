import { describe, expect, it } from "vitest";
import { AudioTimelineSchema } from "./audio";

const segment = {
  id: "audio_segment_1", taskId: "task_audio_1", revisionId: "revision_1", slideId: "slide_1",
  narrationId: "narration_1", slideOrder: 1, segmentOrder: 0, displayText: "导数。", spokenText: "导数。",
  durationMs: 1000, assetId: "asset_audio_1", sha256: "a".repeat(64),
};

describe("stage T-D audio timeline", () => {
  it("accepts a continuous non-overlapping timeline", () => {
    expect(AudioTimelineSchema.safeParse({
      taskId: "task_audio_1", projectId: "project_1", presentationId: "presentation_1",
      voice: "zh-CN-YunxiNeural", rate: "-8%", pitch: "-2Hz", totalDurationMs: 1000,
      segments: [segment], cues: [{ id: "cue_1", audioSegmentId: segment.id, index: 1, startMs: 0, endMs: 1000, text: "导数。" }],
      srtAssetId: "asset_srt_1",
    }).success).toBe(true);
  });

  it("rejects overlapping or mismatched cues", () => {
    const second = { ...segment, id: "audio_segment_2", narrationId: "narration_2", segmentOrder: 1 };
    expect(AudioTimelineSchema.safeParse({
      taskId: "task_audio_1", projectId: "project_1", presentationId: "presentation_1",
      voice: "zh-CN-YunxiNeural", rate: "-8%", pitch: "-2Hz", totalDurationMs: 1900,
      segments: [segment, second], cues: [
        { id: "cue_1", audioSegmentId: segment.id, index: 1, startMs: 0, endMs: 1000, text: "一。" },
        { id: "cue_2", audioSegmentId: second.id, index: 2, startMs: 900, endMs: 1900, text: "二。" },
      ], srtAssetId: "asset_srt_1",
    }).success).toBe(false);
  });
});
