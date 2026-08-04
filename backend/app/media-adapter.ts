import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import type { MediaValidationReport } from "@ppt-digital-human/contracts";
import { MediaValidationReportSchema } from "@ppt-digital-human/contracts";
import { WorkerError } from "./worker-error.ts";

const require = createRequire(import.meta.url);
const ffmpegValue = require("@ffmpeg-installer/ffmpeg") as string | { path?: string };
const ffprobeValue = require("ffprobe-static") as string | { path?: string };
const FFMPEG = typeof ffmpegValue === "string" ? ffmpegValue : ffmpegValue.path;
const FFPROBE = typeof ffprobeValue === "string" ? ffprobeValue : ffprobeValue.path;

export interface CompositeAdapterInput {
  pageVideoPaths: string[];
  captionsPath: string;
  fps: 25 | 30;
  expectedDurationMs: number;
  attemptDir: string;
  signal: AbortSignal;
}
export interface CompositeAdapterResult { bytes: Uint8Array; }
export interface CompositeAdapter { run(input: CompositeAdapterInput): Promise<CompositeAdapterResult>; }

export class FfmpegCompositeAdapter implements CompositeAdapter {
  async run(input: CompositeAdapterInput): Promise<CompositeAdapterResult> {
    requireTools();
    await mkdir(dirname(input.attemptDir), { recursive: true }); await mkdir(input.attemptDir, { recursive: false });
    const concatPath = join(input.attemptDir, "pages.txt");
    const outputPath = join(input.attemptDir, "candidate.mp4");
    await writeFile(concatPath, `${input.pageVideoPaths.map(fileLine).join("\n")}\n`, "utf8");
    const captions = resolve(input.captionsPath).replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
    const style = "FontName=Microsoft YaHei,FontSize=10,PrimaryColour=&H00FFFFFF,BackColour=&HA0000000,BorderStyle=3,Outline=0.5,Alignment=2,MarginL=24,MarginR=24,MarginV=25";
    await run(FFMPEG!, [
      "-y", "-v", "error", "-filter_threads", "1", "-f", "concat", "-safe", "0", "-i", concatPath,
      "-vf", `subtitles='${captions}':force_style='${style}'`, "-r", String(input.fps),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-t", (input.expectedDurationMs / 1_000).toFixed(3), outputPath,
    ], input.signal);
    const bytes = await readFile(outputPath);
    if (bytes.byteLength < 10_000) throw new WorkerError("COMPOSITE_EMPTY", "最终候选视频为空或过小。", true);
    return { bytes };
  }
}

export interface ValidationPageInput {
  pageOrder: number;
  durationMs: number;
  framePath: string;
  avatarPlacement: string;
  overlayType?: string | null;
}
export interface MediaValidationInput {
  videoPath: string;
  fps: 25 | 30;
  expectedDurationMs: number;
  expectedPageCount: number;
  pages: ValidationPageInput[];
  attemptDir: string;
  signal: AbortSignal;
}
export interface MediaValidationAdapter { run(input: MediaValidationInput): Promise<MediaValidationReport>; }

export class FfmpegMediaValidationAdapter implements MediaValidationAdapter {
  async run(input: MediaValidationInput): Promise<MediaValidationReport> {
    requireTools(); await mkdir(input.attemptDir, { recursive: true });
    const errors: string[] = [];
    const probe = await run(FFPROBE!, ["-v", "error", "-show_streams", "-show_format", "-of", "json", input.videoPath], input.signal);
    const media = JSON.parse(probe.stdout) as { streams?: Array<Record<string, unknown>>; format?: { duration?: string } };
    const video = media.streams?.find((stream) => stream.codec_type === "video");
    const audio = media.streams?.find((stream) => stream.codec_type === "audio");
    const durationMs = Math.round(Number(media.format?.duration ?? 0) * 1_000);
    const fps = parseRate(String(video?.avg_frame_rate ?? "0/1"));
    if (video?.codec_name !== "h264") errors.push("VIDEO_CODEC_NOT_H264");
    if (audio?.codec_name !== "aac") errors.push("AUDIO_CODEC_NOT_AAC");
    if (video?.pix_fmt !== "yuv420p") errors.push("PIXEL_FORMAT_NOT_YUV420P");
    if (video?.width !== 1920 || video?.height !== 1080) errors.push("VIDEO_DIMENSIONS_INVALID");
    if (Math.abs(fps - input.fps) > .01) errors.push("FRAME_RATE_INVALID");
    if (!Number.isFinite(durationMs) || Math.abs(durationMs - input.expectedDurationMs) > 500) errors.push("MEDIA_DURATION_MISMATCH");
    const bytes = await readFile(input.videoPath);
    const fastStart = bytes.indexOf(Buffer.from("moov")) > 0 && bytes.indexOf(Buffer.from("moov")) < bytes.indexOf(Buffer.from("mdat"));
    if (!fastStart) errors.push("FAST_START_MISSING");
    let fullDecode = true;
    try { await run(FFMPEG!, ["-v", "error", "-i", input.videoPath, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], input.signal); }
    catch { fullDecode = false; errors.push("FULL_DECODE_FAILED"); }
    const volume = await run(FFMPEG!, ["-v", "info", "-i", input.videoPath, "-af", "volumedetect", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], input.signal);
    const volumeMatch = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(volume.stderr);
    const nonSilent = Boolean(volumeMatch && Number(volumeMatch[1]) >= -65);
    if (!nonSilent) errors.push("AUDIO_SILENT");
    const black = await run(FFMPEG!, ["-v", "info", "-i", input.videoPath, "-vf", "blackdetect=d=0.25:pix_th=0.02", "-an", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], input.signal);
    const blackDurations = [...black.stderr.matchAll(/black_duration:([0-9.]+)/g)].map((match) => Number(match[1]) * 1_000);
    const maxBlackDurationMs = Math.round(Math.max(0, ...blackDurations));
    if (maxBlackDurationMs > 250) errors.push("BLACK_FRAME_DETECTED");
    const pageCoverage = await verifyCoverage(input);
    if (pageCoverage.length !== input.expectedPageCount || pageCoverage.some((order, index) => order !== index + 1)) errors.push("PAGE_COVERAGE_INCOMPLETE");
    if (input.pages.some((page) => page.durationMs < 1_500)) errors.push("PAGE_DURATION_TOO_SHORT");
    const obstructionClear = input.pages.every((page) => page.avatarPlacement === "right-panel" && (!page.overlayType || ["highlightBox", "arrow"].includes(page.overlayType)));
    if (!obstructionClear) errors.push("OBSTRUCTION_POLICY_FAILED");
    return MediaValidationReportSchema.parse({
      status: errors.length ? "failed" : "passed", videoCodec: String(video?.codec_name ?? ""), audioCodec: String(audio?.codec_name ?? ""),
      pixelFormat: String(video?.pix_fmt ?? ""), fps: input.fps, width: 1920, height: 1080, durationMs,
      expectedDurationMs: input.expectedDurationMs, fastStart, fullDecode, nonSilent, maxBlackDurationMs,
      pageCount: input.expectedPageCount, pageCoverage, obstructionClear, errors,
    });
  }
}

async function verifyCoverage(input: MediaValidationInput): Promise<number[]> {
  const covered: number[] = [];
  let cursorMs = 0;
  for (const page of input.pages) {
    const screenshot = join(input.attemptDir, `coverage-${page.pageOrder}.png`);
    const timestamp = (cursorMs + Math.floor(page.durationMs / 2)) / 1_000;
    await run(FFMPEG!, ["-y", "-v", "error", "-ss", timestamp.toFixed(3), "-i", input.videoPath, "-frames:v", "1", screenshot], input.signal);
    const [actual, expected] = await Promise.all([
      sharp(screenshot).resize(64, 36).removeAlpha().raw().toBuffer(),
      sharp(page.framePath).resize(64, 36).removeAlpha().raw().toBuffer(),
    ]);
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference += Math.abs(actual[index] - expected[index]);
    const mean = difference / actual.length;
    if (mean < 24) covered.push(page.pageOrder);
    cursorMs += page.durationMs;
  }
  return covered;
}

function fileLine(path: string): string { return `file '${path.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`; }
function parseRate(value: string): number { const [a, b] = value.split("/").map(Number); return b ? a / b : 0; }
function requireTools() { if (!FFMPEG || !FFPROBE) throw new WorkerError("MEDIA_TOOLS_MISSING", "缺少 FFmpeg/ffprobe。", false); }

function run(command: string, args: string[], signal: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const abort = () => terminateProcessTree(child); signal.addEventListener("abort", abort, { once: true });
  return new Promise((resolveRun, reject) => {
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { if (stdout.length < 2_000_000) stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { if (stderr.length < 2_000_000) stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new WorkerError("MEDIA_CANCELLED", "媒体处理已取消。", true));
      else if (code !== 0) reject(new WorkerError("MEDIA_PROCESS_FAILED", `媒体进程失败：${stderr.slice(-500)}`, true));
      else resolveRun({ stdout, stderr });
    });
  });
}
function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") { const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); killer.unref(); }
  else child.kill("SIGTERM");
}
