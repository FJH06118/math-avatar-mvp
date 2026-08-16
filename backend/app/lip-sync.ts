import { LipSyncTimelineSchema, WordTimingCaptureSchema, type LipSyncTimeline, type WordTimingCapture } from "@ppt-digital-human/contracts";
import { generateLipSyncTimeline, sha256Canonical } from "../lip-sync/driver.mjs";
import { WorkerError } from "./worker-error.ts";

export function buildLipSyncTimeline(input: { samples: Int16Array; sampleRateHz: number; durationMs: number; fps: 25 | 30; wordTiming?: unknown }): LipSyncTimeline {
  try {
    const parsedTiming: WordTimingCapture | null = input.wordTiming === undefined || input.wordTiming === null ? null : WordTimingCaptureSchema.parse(input.wordTiming);
    const result = LipSyncTimelineSchema.parse(generateLipSyncTimeline({ ...input, wordTiming: parsedTiming }));
    const { timelineHash, ...withoutHash } = result;
    if (sha256Canonical(withoutHash) !== timelineHash) throw new Error("timeline hash mismatch");
    return result;
  } catch (error) {
    if (error instanceof WorkerError) throw error;
    throw new WorkerError("LIP_SYNC_GENERATION_FAILED", "唇形时间轴无法生成或校验。", false);
  }
}
