import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WorkerError } from "./worker-error.ts";
import { WordTimingCaptureSchema, type WordTimingCapture } from "@ppt-digital-human/contracts";

const require = createRequire(import.meta.url);
const ffprobeModule = require("ffprobe-static") as string | { path?: string };
const FFPROBE = typeof ffprobeModule === "string" ? ffprobeModule : ffprobeModule.path;
const ffmpegModule = require("@ffmpeg-installer/ffmpeg") as string | { path?: string };
const FFMPEG = typeof ffmpegModule === "string" ? ffmpegModule : ffmpegModule.path;
const CHILD = fileURLToPath(new URL("./edge-tts-child.mjs", import.meta.url));
const MAX_OUTPUT = 16 * 1024;

export interface AudioAdapterInput {
  text: string;
  voice: string;
  rate: string;
  pitch: string;
  attemptDir: string;
  signal: AbortSignal;
}

export interface AudioAdapterResult {
  bytes: Uint8Array;
  durationMs: number;
  sampleRateHz?: number;
  meanDb?: number;
  peakDb?: number;
  timingMetadata?: WordTimingCapture;
}

export interface AudioAdapter {
  run(input: AudioAdapterInput): Promise<AudioAdapterResult>;
}

export class EdgeTtsAudioAdapter implements AudioAdapter {
  async run(input: AudioAdapterInput): Promise<AudioAdapterResult> {
    if (!FFPROBE || !FFMPEG) throw new WorkerError("AUDIO_VALIDATOR_MISSING", "缺少音频校验工具。", false);
    await mkdir(dirname(input.attemptDir), { recursive: true });
    await mkdir(input.attemptDir, { recursive: false });
    const outputPath = join(input.attemptDir, "sentence.mp3");
    const child = spawn(process.execPath, [CHILD], { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
    const abort = () => terminateProcessTree(child);
    input.signal.addEventListener("abort", abort, { once: true });
    child.stdin.end(JSON.stringify({
      text: input.text,
      voice: input.voice,
      rate: input.rate,
      pitch: input.pitch,
      outputPath,
    }));
    try {
      const { code } = await collect(child);
      if (input.signal.aborted) throw new WorkerError("AUDIO_CANCELLED", "音频合成已取消。", true);
      if (code !== 0) throw new WorkerError("EDGE_TTS_FAILED", "Edge TTS 合成失败。", true);
      if ((await stat(outputPath)).size <= 2_000) {
        throw new WorkerError("AUDIO_EMPTY", "音频文件为空或过小。", true);
      }
      const quality = await inspectAudioFile(outputPath);
      const timingMetadata = await readTimingSidecar(`${outputPath}.json`, quality.durationMs);
      return { bytes: await readFile(outputPath), ...quality, timingMetadata };
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      throw new WorkerError("AUDIO_OUTPUT_INVALID", "音频产物无法读取或校验。", true);
    } finally {
      input.signal.removeEventListener("abort", abort);
    }
  }
}

async function readTimingSidecar(path: string, durationMs: number): Promise<WordTimingCapture> {
  const unavailable = (reason: string) => WordTimingCaptureSchema.parse({
    schemaVersion: "word-timing-v1", captureVersion: "edge-word-boundary-v1", status: "UNAVAILABLE",
    provider: "edge-tts", reason, boundaries: [],
  });
  try {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(raw) || raw.length === 0) return unavailable("SIDECAR_EMPTY");
    const boundaries = raw.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("entry invalid");
      const record = value as Record<string, unknown>;
      if (Object.keys(record).sort().join(",") !== "end,part,start") throw new Error("entry keys invalid");
      if (typeof record.part !== "string" || !record.part.trim() || !Number.isInteger(record.start) || !Number.isInteger(record.end)) throw new Error("entry values invalid");
      const startMs = record.start as number;
      const rawEnd = record.end as number;
      if (startMs < 0 || rawEnd <= startMs || rawEnd > durationMs + 250) throw new Error("entry range invalid");
      return { text: record.part.trim(), startMs, endMs: Math.min(rawEnd, durationMs) };
    });
    return WordTimingCaptureSchema.parse({ schemaVersion: "word-timing-v1", captureVersion: "edge-word-boundary-v1", status: "AVAILABLE", provider: "edge-tts", boundaries });
  } catch {
    return unavailable("SIDECAR_MISSING_OR_INVALID");
  }
}

export async function inspectAudioFile(path: string): Promise<{ durationMs: number; sampleRateHz: number; meanDb: number; peakDb: number }> {
  const probe = await probeAudio(path);
  if (!Number.isInteger(probe.durationMs) || probe.durationMs < 200) throw new WorkerError("AUDIO_UNDECODABLE", "音频无法解码或时长无效。", true);
  if (probe.sampleRateHz < 16_000 || probe.sampleRateHz > 48_000) throw new WorkerError("AUDIO_SAMPLE_RATE_INVALID", "音频采样率必须在 16kHz 到 48kHz 之间。", false);
  const volume = await detectVolume(path);
  if (volume.meanDb < -65) throw new WorkerError("AUDIO_SILENT", "音频内容为静音。", true);
  if (volume.peakDb >= -0.05) throw new WorkerError("AUDIO_CLIPPED", "音频存在削波风险。", true);
  return { ...probe, ...volume };
}

function probeAudio(path: string): Promise<{ durationMs: number; sampleRateHz: number }> {
  const child = spawn(FFPROBE!, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,sample_rate:format=duration", "-of", "json", path], {
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => { if (stdout.length < MAX_OUTPUT) stdout += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      try {
        const output = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; codec_name?: string; sample_rate?: string }>; format?: { duration?: string } };
        const seconds = Number(output.format?.duration);
        const audio = output.streams?.find((stream) => stream.codec_type === "audio" && Boolean(stream.codec_name));
        const sampleRateHz = Number(audio?.sample_rate);
        if (code !== 0 || !audio || !Number.isFinite(seconds) || !Number.isInteger(sampleRateHz)) reject(new Error("ffprobe failed"));
        else resolve({ durationMs: Math.round(seconds * 1_000), sampleRateHz });
      } catch { reject(new Error("ffprobe output invalid")); }
    });
  });
}

function detectVolume(path: string): Promise<{ meanDb: number; peakDb: number }> {
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  const child = spawn(FFMPEG!, ["-v", "info", "-i", path, "-af", "volumedetect", "-f", "null", nullDevice], {
    stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => { if (stderr.length < MAX_OUTPUT) stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr);
      const peak = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr);
      if (code !== 0 || !mean || !peak) reject(new Error("volume detection failed"));
      else resolve({ meanDb: Number(mean[1]), peakDb: Number(peak[1]) });
    });
  });
}

function collect(child: ChildProcess): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    child.stderr?.resume();
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code }));
  });
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    killer.unref();
  } else child.kill("SIGTERM");
}
