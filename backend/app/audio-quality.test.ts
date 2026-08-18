import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { inspectAudioFile, parseEdgeTtsChildError } from "./audio-adapter.ts";
import { WorkerError } from "./worker-error.ts";

const require = createRequire(import.meta.url);
const ffmpegValue = require("@ffmpeg-installer/ffmpeg") as { path: string };
let root = "";
before(async () => { root = await mkdtemp(join(tmpdir(), "ppt-dh-audio-quality-")); });
after(async () => { await rm(root, { recursive: true, force: true }); });

test("accepts decodable 24kHz audio with safe peak", async () => {
  const path = join(root, "valid.mp3");
  createAudio(path, "sine=frequency=440:duration=1,volume=0.2", 24_000);
  const quality = await inspectAudioFile(path);
  assert.equal(quality.sampleRateHz, 24_000);
  assert(quality.meanDb > -65 && quality.peakDb < -0.05);
});

test("rejects silence, clipping, and unsupported sample rate with stable codes", async () => {
  const silent = join(root, "silent.mp3");
  execFileSync(ffmpegValue.path, ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "1", silent]);
  await rejectsCode(silent, "AUDIO_SILENT");
  const clipped = join(root, "clipped.mp3");
  createAudio(clipped, "sine=frequency=440:duration=1,volume=100", 24_000);
  await rejectsCode(clipped, "AUDIO_CLIPPED");
  const lowRate = join(root, "low-rate.mp3");
  createAudio(lowRate, "sine=frequency=440:duration=1,volume=0.2", 8_000);
  await rejectsCode(lowRate, "AUDIO_SAMPLE_RATE_INVALID");
});

test("accepts only the bounded Edge TTS child error protocol", () => {
  assert.equal(parseEdgeTtsChildError(JSON.stringify({
    type: "edge-tts-error",
    protocolVersion: 1,
    code: "EDGE_TTS_CONNECTION_FAILED",
  })), "EDGE_TTS_CONNECTION_FAILED");
  assert.equal(parseEdgeTtsChildError("Error: secret path C:\\private\\stack"), null);
  assert.equal(parseEdgeTtsChildError(JSON.stringify({
    type: "edge-tts-error",
    protocolVersion: 1,
    code: "UNSAFE_INTERNAL_ERROR",
  })), null);
});

function createAudio(path: string, source: string, sampleRate: number) {
  execFileSync(ffmpegValue.path, ["-y", "-v", "error", "-f", "lavfi", "-i", source, "-ar", String(sampleRate), "-ac", "1", "-b:a", "48k", path]);
}

async function rejectsCode(path: string, code: string) {
  await assert.rejects(inspectAudioFile(path), (error: unknown) => error instanceof WorkerError && error.code === code);
}
