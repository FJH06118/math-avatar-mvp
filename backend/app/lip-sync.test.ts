import assert from "node:assert/strict";
import { test } from "node:test";
import { LipSyncTimelineSchema } from "@ppt-digital-human/contracts";
import { buildLipSyncTimeline } from "./lip-sync.ts";

test("driver is deterministic, smooth and closes within two frames after sustained silence", () => {
  const samples = fixturePcm(2_000, [[100, 720, 5_000], [900, 1_450, 13_000], [1_650, 1_880, 24_000]]);
  const input = { samples, sampleRateHz: 16_000, durationMs: 2_000, fps: 25 as const };
  const first = buildLipSyncTimeline(input);
  assert.deepEqual(first, buildLipSyncTimeline(input));
  assert.equal(first.mode, "ENERGY_ONLY");
  assert.equal(first.statistics.poseFrameCounts.ROUND, 0);
  assert(first.statistics.poseFrameCounts.SMALL > 0 && first.statistics.poseFrameCounts.MEDIUM > 0 && first.statistics.poseFrameCounts.LARGE > 0);
  assert(first.statistics.maximumOpeningStep <= 1);
  assert(first.statistics.longestSilenceCloseResponseMs <= 80);
  LipSyncTimelineSchema.parse(first);
});

test("valid boundaries enable ROUND only for reliable Chinese rounded syllables", () => {
  const samples = fixturePcm(1_000, [[0, 1_000, 12_000]]);
  const available = { schemaVersion: "word-timing-v1", captureVersion: "edge-word-boundary-v1", status: "AVAILABLE", provider: "edge-tts", boundaries: [{ text: "求导", startMs: 0, endMs: 500 }, { text: "函数", startMs: 500, endMs: 1_000 }] };
  const timeline = buildLipSyncTimeline({ samples, sampleRateHz: 16_000, durationMs: 1_000, fps: 25, wordTiming: available });
  assert.equal(timeline.mode, "BOUNDARY_ENERGY");
  assert(timeline.statistics.poseFrameCounts.ROUND > 0);
});

test("unavailable boundaries explicitly use ENERGY_ONLY without ROUND", () => {
  const samples = fixturePcm(1_000, [[0, 1_000, 12_000]]);
  const unavailable = { schemaVersion: "word-timing-v1", captureVersion: "edge-word-boundary-v1", status: "UNAVAILABLE", provider: "edge-tts", reason: "SIDECAR_INVALID", boundaries: [] };
  const timeline = buildLipSyncTimeline({ samples, sampleRateHz: 16_000, durationMs: 1_000, fps: 30, wordTiming: unavailable });
  assert.equal(timeline.mode, "ENERGY_ONLY");
  assert.equal(timeline.statistics.poseFrameCounts.ROUND, 0);
});

test("duration mismatch is a stable failure instead of mechanical fallback", () => {
  assert.throws(() => buildLipSyncTimeline({ samples: new Int16Array(16_000), sampleRateHz: 16_000, durationMs: 2_000, fps: 25 }), /唇形时间轴无法生成/);
});

function fixturePcm(durationMs: number, ranges: Array<[number, number, number]>): Int16Array {
  const samples = new Int16Array(durationMs * 16);
  for (const [startMs, endMs, amplitude] of ranges) for (let index = startMs * 16; index < endMs * 16; index += 1) samples[index] = index % 32 < 16 ? amplitude : -amplitude;
  return samples;
}
