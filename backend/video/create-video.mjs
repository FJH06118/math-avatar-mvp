import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  getFfmpegPath,
  loadReviewedJob,
  parseArgs,
  readJson,
  requireJobDir,
  safeFileStem,
  toFfmpegFilterPath,
  writeJson,
} from "./common.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { values } = parseArgs();
const jobDir = requireJobDir(values["job-dir"]);
const { plan } = loadReviewedJob(jobDir, {
  allowUnreviewed: Boolean(values["allow-unreviewed"]),
});
const timeline = readJson(path.join(jobDir, "scene-timeline.json"));
const ffmpegPath = getFfmpegPath();
const here = path.dirname(fileURLToPath(import.meta.url));
const pipelineDir = path.resolve(here, "..");
const avatarDir = path.join(pipelineDir, "assets", "avatar");
const frameDir = path.join(jobDir, "video", "frames");
const workDir = path.join(jobDir, "video", "composited");
const outputDir = path.join(jobDir, "output");
fs.mkdirSync(workDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const framePaths = fs
  .readdirSync(frameDir)
  .filter((name) => name.toLowerCase().endsWith(".png"))
  .sort()
  .map((name) => path.join(frameDir, name));
if (framePaths.length !== timeline.scenes.length) {
  throw new Error(
    `画面数 ${framePaths.length} 与场景数 ${timeline.scenes.length} 不一致`,
  );
}

const closedAvatarPath = path.join(avatarDir, "teacher-closed.png");
const openAvatarPath = path.join(avatarDir, "teacher-open.png");
for (const avatarPath of [closedAvatarPath, openAvatarPath]) {
  if (!fs.existsSync(avatarPath)) {
    throw new Error(`缺少数字人素材：${avatarPath}`);
  }
}
const closedAvatar = await sharp(closedAvatarPath)
  .resize(440, 440, { fit: "contain" })
  .png()
  .toBuffer();
const openAvatar = await sharp(openAvatarPath)
  .resize(440, 440, { fit: "contain" })
  .png()
  .toBuffer();

const composited = [];
for (const [index, framePath] of framePaths.entries()) {
  const sceneFrames = [];
  for (const [mouth, avatar] of [
    ["closed", closedAvatar],
    ["open", openAvatar],
  ]) {
    const outputFrame = path.join(
      workDir,
      `${String(index + 1).padStart(3, "0")}-${mouth}.jpg`,
    );
    await sharp(framePath)
      .composite([{ input: avatar, left: 1500, top: 570 }])
      .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
      .toFile(outputFrame);
    sceneFrames.push(outputFrame);
  }
  composited.push(sceneFrames);
}

function concatFileLine(filePath) {
  const normalized = filePath.replaceAll("\\", "/").replaceAll("'", "'\\''");
  return `file '${normalized}'`;
}

const concatLines = [];
for (const [index, scene] of timeline.scenes.entries()) {
  let remaining = scene.duration;
  let mouthIndex = 0;
  while (remaining > 0.000_1) {
    const frameDuration = Math.min(
      mouthIndex % 2 === 0 ? 0.12 : 0.1,
      remaining,
    );
    concatLines.push(concatFileLine(composited[index][mouthIndex % 2]));
    concatLines.push(`duration ${frameDuration.toFixed(6)}`);
    remaining -= frameDuration;
    mouthIndex += 1;
  }
}
concatLines.push(concatFileLine(composited.at(-1)[0]));
const concatPath = path.join(jobDir, "video", "animated-scenes.txt");
fs.writeFileSync(concatPath, `${concatLines.join("\n")}\n`, "utf8");

const captionPath = path.join(jobDir, "captions.srt");
const narrationPath = path.join(jobDir, "audio", "narration.m4a");
const forceStyle = [
  "FontName=Microsoft YaHei",
  "FontSize=10",
  "PrimaryColour=&H00FFFFFF",
  "BackColour=&HA0000000",
  "OutlineColour=&H60000000",
  "BorderStyle=3",
  "Outline=0.5",
  "Shadow=0",
  "Alignment=2",
  "MarginL=24",
  "MarginR=108",
  "MarginV=25",
  "Spacing=0.1",
].join(",");
const filterGraph = [
  `[0:v]fps=${VIDEO_FPS},scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:flags=lanczos,`,
  `subtitles='${toFfmpegFilterPath(captionPath)}'`,
  `:force_style='${forceStyle}'[v]`,
].join("");
const fileStem = safeFileStem(plan.courseTitle);
const outputPath = path.join(outputDir, `${fileStem}-数字人讲解.mp4`);

execFileSync(
  ffmpegPath,
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-filter_threads",
    "1",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-i",
    narrationPath,
    "-filter_complex",
    filterGraph,
    "-map",
    "[v]",
    "-map",
    "1:a:0",
    "-t",
    timeline.totalDuration.toFixed(6),
    "-c:v",
    "libx264",
    "-preset",
    process.env.VIDEO_PRESET || "veryfast",
    "-crf",
    process.env.VIDEO_CRF || "22",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-metadata",
    `title=${plan.courseTitle}`,
    outputPath,
  ],
  { stdio: "inherit" },
);

const outputCaptionPath = path.join(outputDir, `${fileStem}-字幕.srt`);
const outputTranscriptPath = path.join(outputDir, `${fileStem}-讲解稿.txt`);
fs.copyFileSync(captionPath, outputCaptionPath);
fs.copyFileSync(
  path.join(jobDir, "transcript.txt"),
  outputTranscriptPath,
);
writeJson(path.join(outputDir, "result.json"), {
  schemaVersion: 1,
  status: "completed",
  courseTitle: plan.courseTitle,
  videoPath: outputPath,
  captionPath: outputCaptionPath,
  transcriptPath: outputTranscriptPath,
  duration: timeline.totalDuration,
  sceneCount: timeline.scenes.length,
  completedAt: new Date().toISOString(),
});
console.log(
  JSON.stringify({
    outputPath,
    duration: timeline.totalDuration,
    sceneCount: timeline.scenes.length,
  }),
);
