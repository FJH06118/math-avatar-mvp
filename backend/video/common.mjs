import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 12;

export function parseArgs(argv = process.argv.slice(2)) {
  const values = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values[key] = true;
      continue;
    }
    values[key] = next;
    index += 1;
  }
  return { values, positionals };
}

export function requireJobDir(value) {
  if (!value) {
    throw new Error("缺少 --job-dir 参数");
  }
  const jobDir = path.resolve(value);
  if (!fs.existsSync(jobDir)) {
    throw new Error(`任务目录不存在：${jobDir}`);
  }
  return jobDir;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

export function loadReviewedJob(jobDir, { allowUnreviewed = false } = {}) {
  const reviewedPath = path.join(jobDir, "scenes.reviewed.json");
  const generatedPath = path.join(jobDir, "scenes.generated.json");
  const scenesPath =
    fs.existsSync(reviewedPath) || !allowUnreviewed
      ? reviewedPath
      : generatedPath;
  if (!fs.existsSync(scenesPath)) {
    throw new Error(
      `缺少 ${path.basename(reviewedPath)}。请先人工检查 scenes.generated.json，再运行 approve。`,
    );
  }
  const deckPath = path.join(jobDir, "parsed-deck.json");
  if (!fs.existsSync(deckPath)) {
    throw new Error(`缺少解析结果：${deckPath}`);
  }
  const plan = readJson(scenesPath);
  const deck = readJson(deckPath);
  if (!Array.isArray(plan.scenes) || plan.scenes.length === 0) {
    throw new Error("场景规划为空，无法生成视频");
  }
  if (!allowUnreviewed && plan.approval?.status !== "approved") {
    throw new Error("场景规划尚未批准，拒绝生成视频");
  }
  return { deck, plan, scenesPath };
}

export function getFfmpegPath() {
  if (process.env.PIPELINE_FFMPEG) {
    return process.env.PIPELINE_FFMPEG;
  }
  const value = require("@ffmpeg-installer/ffmpeg");
  const executable = typeof value === "string" ? value : value.path;
  if (!executable || !fs.existsSync(executable)) {
    throw new Error("找不到 @ffmpeg-installer/ffmpeg 可执行文件");
  }
  return executable;
}

export function getFfprobePath() {
  if (process.env.PIPELINE_FFPROBE) {
    return process.env.PIPELINE_FFPROBE;
  }
  const value = require("ffprobe-static");
  const executable = typeof value === "string" ? value : value.path;
  if (!executable || !fs.existsSync(executable)) {
    throw new Error("找不到 ffprobe-static 可执行文件");
  }
  return executable;
}

export function formatSrtTime(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(secs).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`,
  ].join(":");
}

export function safeFileStem(value, fallback = "高等数学讲解") {
  const cleaned = String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return (cleaned || fallback).slice(0, 100);
}

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function wrapText(value, maxCharacters = 16) {
  const source = String(value || "").trim();
  const lines = [];
  let current = "";
  for (const character of source) {
    current += character;
    if (
      current.length >= maxCharacters ||
      "，。；：！？、,.!?;:".includes(character)
    ) {
      lines.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.length ? lines : [""];
}

export function toFfmpegFilterPath(filePath) {
  return path
    .resolve(filePath)
    .replaceAll("\\", "/")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}
