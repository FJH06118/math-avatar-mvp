import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WorkerError } from "./worker-error.ts";

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
      const durationMs = await probeDuration(outputPath);
      if (!Number.isInteger(durationMs) || durationMs < 200) {
        throw new WorkerError("AUDIO_UNDECODABLE", "音频无法解码或时长无效。", true);
      }
      await assertAudible(outputPath);
      return { bytes: await readFile(outputPath), durationMs };
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      throw new WorkerError("AUDIO_OUTPUT_INVALID", "音频产物无法读取或校验。", true);
    } finally {
      input.signal.removeEventListener("abort", abort);
    }
  }
}

function probeDuration(path: string): Promise<number> {
  const child = spawn(FFPROBE!, ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", path], {
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => { if (stdout.length < MAX_OUTPUT) stdout += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      try {
        const output = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; codec_name?: string }>; format?: { duration?: string } };
        const seconds = Number(output.format?.duration);
        const audio = output.streams?.some((stream) => stream.codec_type === "audio" && Boolean(stream.codec_name));
        if (code !== 0 || !audio || !Number.isFinite(seconds)) reject(new Error("ffprobe failed"));
        else resolve(Math.round(seconds * 1_000));
      } catch { reject(new Error("ffprobe output invalid")); }
    });
  });
}

function assertAudible(path: string): Promise<void> {
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  const child = spawn(FFMPEG!, ["-v", "info", "-i", path, "-af", "volumedetect", "-f", "null", nullDevice], {
    stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => { if (stderr.length < MAX_OUTPUT) stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      const match = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr);
      if (code !== 0 || !match || Number(match[1]) < -65) reject(new Error("audio is silent"));
      else resolve();
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
