import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Overlay } from "@ppt-digital-human/contracts";
import { WorkerError } from "./worker-error.ts";

const require = createRequire(import.meta.url);
const ffmpegValue = require("@ffmpeg-installer/ffmpeg") as string | { path?: string };
const ffprobeValue = require("ffprobe-static") as string | { path?: string };
const FFMPEG = typeof ffmpegValue === "string" ? ffmpegValue : ffmpegValue.path;
const FFPROBE = typeof ffprobeValue === "string" ? ffprobeValue : ffprobeValue.path;
const AVATAR = fileURLToPath(new URL("../assets/avatar/teacher-closed.png", import.meta.url));
const WIDTH = 1920;
const HEIGHT = 1080;
const SLIDE = { left: 34, top: 104, width: 1500, height: 844 } as const;

export interface PageRenderAdapterInput {
  sourcePath: string;
  audioPaths: string[];
  durationMs: number;
  fps: 25 | 30;
  pageOrder: number;
  pageCount: number;
  overlay?: Overlay;
  attemptDir: string;
  signal: AbortSignal;
}

export interface PageRenderAdapterResult {
  frameBytes: Uint8Array;
  videoBytes: Uint8Array;
  avatarPlacement: "right-panel";
  overlayType?: "highlightBox" | "arrow";
}

export interface PageRenderAdapter { run(input: PageRenderAdapterInput): Promise<PageRenderAdapterResult>; }

export class SharpFfmpegPageRenderAdapter implements PageRenderAdapter {
  async run(input: PageRenderAdapterInput): Promise<PageRenderAdapterResult> {
    if (!FFMPEG || !FFPROBE) throw new WorkerError("MEDIA_TOOLS_MISSING", "缺少 FFmpeg/ffprobe。", false);
    if (input.durationMs < 1_500 || input.audioPaths.length === 0) throw new WorkerError("RENDER_INPUT_INVALID", "分页渲染输入无效。", false);
    await mkdir(dirname(input.attemptDir), { recursive: true });
    await mkdir(input.attemptDir, { recursive: false });
    const framePath = join(input.attemptDir, "frame.png");
    const audioPath = join(input.attemptDir, "page-audio.m4a");
    const videoPath = join(input.attemptDir, "page.mp4");
    const slide = await sharp(input.sourcePath).resize(SLIDE.width, SLIDE.height, { fit: "contain", background: "#ffffff" }).png().toBuffer();
    const avatar = await sharp(AVATAR).resize(300, 300, { fit: "contain" }).png().toBuffer();
    const overlays: Parameters<ReturnType<typeof sharp>["composite"]>[0] = [
      { input: slide, left: SLIDE.left, top: SLIDE.top },
      { input: avatar, left: 1574, top: 620 },
    ];
    if (input.overlay) overlays.push({ input: overlaySvg(input.overlay), left: SLIDE.left, top: SLIDE.top });
    const frameBytes = await sharp(chromeSvg(input.pageOrder, input.pageCount)).composite(overlays).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(framePath, frameBytes, { flag: "wx" });
    const concatPath = join(input.attemptDir, "audio.txt");
    await writeFile(concatPath, `${input.audioPaths.map((path) => `file '${path.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`).join("\n")}\n`, "utf8");
    await runProcess(FFMPEG, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", concatPath, "-c:a", "aac", "-b:a", "128k", audioPath], input.signal);
    await runProcess(FFMPEG, [
      "-y", "-v", "error", "-loop", "1", "-framerate", String(input.fps), "-i", framePath,
      "-i", audioPath, "-t", (input.durationMs / 1_000).toFixed(3), "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
      "-r", String(input.fps), "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", videoPath,
    ], input.signal);
    await verifyPageVideo(videoPath, input.fps, input.durationMs, input.signal);
    return {
      frameBytes,
      videoBytes: await readFile(videoPath),
      avatarPlacement: "right-panel",
      overlayType: input.overlay?.type as "highlightBox" | "arrow" | undefined,
    };
  }
}

function chromeSvg(pageOrder: number, pageCount: number): Buffer {
  const progress = Math.round((pageOrder / pageCount) * 1852);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="#08111f"/><stop offset="1" stop-color="#13233b"/></linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <rect x="34" y="104" width="1500" height="844" rx="18" fill="#fff"/>
    <rect x="1562" y="104" width="324" height="844" rx="18" fill="#162844" stroke="#2a4468" stroke-width="2"/>
    <text x="1592" y="176" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="28" fill="#bfdbfe">课程讲解</text>
    <text x="1592" y="226" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="22" fill="#94a3b8">第 ${pageOrder} / ${pageCount} 页</text>
    <rect x="34" y="979" width="${progress}" height="5" rx="3" fill="#60a5fa"/>
  </svg>`);
}

function overlaySvg(overlay: Overlay): Buffer {
  if (overlay.type === "highlightBox") {
    const x = Math.round(overlay.bounds.x * SLIDE.width);
    const y = Math.round(overlay.bounds.y * SLIDE.height);
    const width = Math.round(overlay.bounds.width * SLIDE.width);
    const height = Math.round(overlay.bounds.height * SLIDE.height);
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE.width}" height="${SLIDE.height}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="${overlay.color}" fill-opacity=".12" stroke="${overlay.color}" stroke-width="6"/></svg>`);
  }
  if (overlay.type === "arrow") {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE.width}" height="${SLIDE.height}"><defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${overlay.color}"/></marker></defs><line x1="${Math.round(overlay.from.x * SLIDE.width)}" y1="${Math.round(overlay.from.y * SLIDE.height)}" x2="${Math.round(overlay.to.x * SLIDE.width)}" y2="${Math.round(overlay.to.y * SLIDE.height)}" stroke="${overlay.color}" stroke-width="7" marker-end="url(#a)"/></svg>`);
  }
  throw new WorkerError("OVERLAY_UNSUPPORTED", "阶段 T 只支持 highlightBox 或 arrow。", false);
}

async function verifyPageVideo(path: string, fps: number, durationMs: number, signal: AbortSignal): Promise<void> {
  const output = await runProcess(FFPROBE!, ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], signal, true);
  const media = JSON.parse(output) as { streams?: Array<Record<string, unknown>>; format?: { duration?: string } };
  const video = media.streams?.find((stream) => stream.codec_type === "video");
  const audio = media.streams?.find((stream) => stream.codec_type === "audio");
  const actualFps = parseRate(String(video?.avg_frame_rate ?? "0/1"));
  const actualDuration = Number(media.format?.duration) * 1_000;
  if (!video || !audio || video.codec_name !== "h264" || audio.codec_name !== "aac" || video.pix_fmt !== "yuv420p" || video.width !== WIDTH || video.height !== HEIGHT || Math.abs(actualFps - fps) > 0.01 || !Number.isFinite(actualDuration) || Math.abs(actualDuration - durationMs) > 400) {
    throw new WorkerError("PAGE_MEDIA_INVALID", "分页视频未通过编码、帧率、尺寸或时长校验。", false);
  }
}

function parseRate(value: string): number {
  const [left, right] = value.split("/").map(Number);
  return right ? left / right : 0;
}

function runProcess(command: string, args: string[], signal: AbortSignal, capture = false): Promise<string> {
  const child = spawn(command, args, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"], windowsHide: true });
  const abort = () => terminateProcessTree(child);
  signal.addEventListener("abort", abort, { once: true });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { if (stderr.length < 32_768) stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new WorkerError("RENDER_CANCELLED", "分页渲染已取消。", true));
      else if (code !== 0) reject(new WorkerError("FFMPEG_FAILED", `分页媒体进程失败：${stderr.slice(-500)}`, true));
      else resolve(stdout);
    });
  });
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    killer.unref();
  } else child.kill("SIGTERM");
}
