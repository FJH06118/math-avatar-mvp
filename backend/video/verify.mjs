import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  getFfmpegPath,
  getFfprobePath,
  loadReviewedJob,
  parseArgs,
  readJson,
  requireJobDir,
  writeJson,
} from "./common.mjs";

const { values } = parseArgs();
const jobDir = requireJobDir(values["job-dir"]);
const { deck, plan } = loadReviewedJob(jobDir, {
  allowUnreviewed: Boolean(values["allow-unreviewed"]),
});
const resultPath = path.join(jobDir, "output", "result.json");
if (!fs.existsSync(resultPath)) {
  throw new Error(`缺少生成结果：${resultPath}`);
}
const result = readJson(resultPath);
const timeline = readJson(path.join(jobDir, "scene-timeline.json"));
const ffprobePath = getFfprobePath();
const ffmpegPath = getFfmpegPath();
const media = JSON.parse(
  execFileSync(
    ffprobePath,
    [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      result.videoPath,
    ],
    { encoding: "utf8" },
  ),
);
const videoStream = media.streams.find(
  (stream) => stream.codec_type === "video",
);
const audioStream = media.streams.find(
  (stream) => stream.codec_type === "audio",
);
const errors = [];
const warnings = [];

if (!videoStream) errors.push("视频流不存在");
if (!audioStream) errors.push("音频流不存在");
if (
  videoStream &&
  (videoStream.width !== VIDEO_WIDTH || videoStream.height !== VIDEO_HEIGHT)
) {
  errors.push(
    `分辨率错误：${videoStream.width}×${videoStream.height}，预期 ${VIDEO_WIDTH}×${VIDEO_HEIGHT}`,
  );
}
if (videoStream && videoStream.codec_name !== "h264") {
  warnings.push(`视频编码为 ${videoStream.codec_name}，不是 h264`);
}
if (audioStream && audioStream.codec_name !== "aac") {
  warnings.push(`音频编码为 ${audioStream.codec_name}，不是 aac`);
}
if (timeline.scenes.length !== plan.scenes.length) {
  errors.push("时间轴场景数与审核后场景数不一致");
}
for (const scene of plan.scenes) {
  for (const slideNumber of scene.sourceSlides) {
    if (slideNumber < 1 || slideNumber > deck.slideCount) {
      errors.push(`场景 ${scene.id} 引用了无效页码 ${slideNumber}`);
    }
  }
}

const captionSource = fs.readFileSync(
  path.join(jobDir, "captions.srt"),
  "utf8",
);
const cuePattern =
  /(\d+)\r?\n(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/g;
const cueTimes = [];
for (const match of captionSource.matchAll(cuePattern)) {
  const start =
    Number(match[2]) * 3600 +
    Number(match[3]) * 60 +
    Number(match[4]) +
    Number(match[5]) / 1000;
  const end =
    Number(match[6]) * 3600 +
    Number(match[7]) * 60 +
    Number(match[8]) +
    Number(match[9]) / 1000;
  cueTimes.push({ index: Number(match[1]), start, end });
}
for (let index = 0; index < cueTimes.length; index += 1) {
  const cue = cueTimes[index];
  if (cue.end <= cue.start) errors.push(`字幕 ${cue.index} 的结束时间无效`);
  if (index > 0 && cue.start < cueTimes[index - 1].end - 0.002) {
    errors.push(`字幕 ${cue.index - 1} 与 ${cue.index} 重叠`);
  }
}
if (cueTimes.length !== timeline.cueCount) {
  errors.push(
    `字幕数量 ${cueTimes.length} 与时间轴记录 ${timeline.cueCount} 不一致`,
  );
}
const mediaDuration = Number(media.format?.duration || 0);
if (Math.abs(mediaDuration - timeline.totalDuration) > 0.35) {
  errors.push(
    `媒体时长 ${mediaDuration.toFixed(3)} 与时间轴 ${timeline.totalDuration.toFixed(3)} 相差过大`,
  );
}

try {
  execFileSync(
    ffmpegPath,
    [
      "-v",
      "error",
      "-i",
      result.videoPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-f",
      "null",
      "-",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
} catch (error) {
  errors.push(`完整解码失败：${String(error.stderr || error.message).trim()}`);
}

const verification = {
  schemaVersion: 1,
  status: errors.length ? "failed" : "passed",
  checkedAt: new Date().toISOString(),
  videoPath: result.videoPath,
  slideCount: deck.slideCount,
  sceneCount: plan.scenes.length,
  cueCount: cueTimes.length,
  duration: mediaDuration,
  video: videoStream
    ? {
        codec: videoStream.codec_name,
        width: videoStream.width,
        height: videoStream.height,
        frameRate: videoStream.r_frame_rate,
      }
    : null,
  audio: audioStream
    ? {
        codec: audioStream.codec_name,
        sampleRate: Number(audioStream.sample_rate),
        channels: audioStream.channels,
      }
    : null,
  errors,
  warnings,
};
writeJson(path.join(jobDir, "output", "verification.json"), verification);
console.log(JSON.stringify(verification));
if (errors.length) process.exit(2);

