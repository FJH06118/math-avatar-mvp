import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import {
  formatSrtTime,
  getFfmpegPath,
  getFfprobePath,
  loadReviewedJob,
  parseArgs,
  requireJobDir,
  writeJson,
} from "./common.mjs";

const require = createRequire(import.meta.url);
const { EdgeTTS } = require("node-edge-tts");

const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = CHANNELS * (BITS_PER_SAMPLE / 8);
const SENTENCE_GAP_SECONDS = 0.26;
const SCENE_LEAD_SECONDS = 0.22;
const SCENE_TAIL_SECONDS = 0.48;
const VOICE = process.env.EDGE_TTS_VOICE || "zh-CN-YunxiNeural";
const RATE = process.env.EDGE_TTS_RATE || "-8%";
const PITCH = process.env.EDGE_TTS_PITCH || "-2Hz";
const CONCURRENCY = Math.max(
  1,
  Number(process.env.EDGE_TTS_CONCURRENCY || 3),
);
const PROXY =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.ALL_PROXY ||
  process.env.all_proxy ||
  undefined;
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

const { values } = parseArgs();
const jobDir = requireJobDir(values["job-dir"]);
const ttsMode = String(values["tts-mode"] || "edge").toLowerCase();
if (!["edge", "silent"].includes(ttsMode)) {
  throw new Error("--tts-mode 只支持 edge 或 silent");
}
const { plan } = loadReviewedJob(jobDir, {
  allowUnreviewed: Boolean(values["allow-unreviewed"]),
});
const ffmpegPath = getFfmpegPath();
const ffprobePath = getFfprobePath();
const audioDir = path.join(jobDir, "audio");
const edgeAudioDir = path.join(audioDir, "edge-sentences");
const sentenceAudioDir = path.join(audioDir, "sentences");
fs.mkdirSync(edgeAudioDir, { recursive: true });
fs.mkdirSync(sentenceAudioDir, { recursive: true });

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function fileDuration(filePath) {
  try {
    return Number(
      execFileSync(
        ffprobePath,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=nk=1:nw=1",
          filePath,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim(),
    );
  } catch {
    return 0;
  }
}

function parseWavData(wav) {
  const buffer = Buffer.from(wav);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return buffer.subarray(offset + 8, offset + 8 + chunkSize);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error("WAV 文件中缺少 data 区块");
}

function silence(seconds) {
  return Buffer.alloc(
    Math.round(seconds * SAMPLE_RATE) * BYTES_PER_SAMPLE,
  );
}

function makeWav(pcm) {
  const header = Buffer.alloc(44);
  const byteRate = SAMPLE_RATE * BYTES_PER_SAMPLE;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function secondsFromPcm(pcm) {
  return pcm.length / (SAMPLE_RATE * BYTES_PER_SAMPLE);
}

function silentSentenceDuration(text) {
  const compactLength = String(text).replace(/\s/g, "").length;
  return Math.min(15, Math.max(1.1, 0.105 * compactLength + 0.45));
}

function validCachedAudio(audioPath, metadataPath, text) {
  if (!fs.existsSync(audioPath) || !fs.existsSync(metadataPath)) return false;
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    return (
      metadata.text === text &&
      metadata.voice === VOICE &&
      metadata.rate === RATE &&
      metadata.pitch === PITCH &&
      fs.statSync(audioPath).size > 2_000 &&
      fileDuration(audioPath) > 0.2
    );
  } catch {
    return false;
  }
}

async function synthesizeOne(task) {
  const sceneDir = path.join(edgeAudioDir, task.sceneId);
  fs.mkdirSync(sceneDir, { recursive: true });
  const stem = String(task.sentenceIndex).padStart(3, "0");
  const audioPath = path.join(sceneDir, `${stem}.mp3`);
  const metadataPath = path.join(sceneDir, `${stem}.json`);
  if (validCachedAudio(audioPath, metadataPath, task.spokenText)) {
    console.log(`[Edge TTS] 复用缓存 ${task.label}`);
    return audioPath;
  }

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const temporaryPath = path.join(
      sceneDir,
      `${stem}.attempt-${attempt}.mp3`,
    );
    try {
      fs.rmSync(temporaryPath, { force: true });
      const tts = new EdgeTTS({
        voice: VOICE,
        lang: "zh-CN",
        outputFormat: OUTPUT_FORMAT,
        saveSubtitles: false,
        proxy: PROXY,
        rate: RATE,
        pitch: PITCH,
        volume: "default",
        timeout: 90_000,
      });
      console.log(`[Edge TTS] 生成 ${task.label}，第 ${attempt} 次尝试`);
      await tts.ttsPromise(task.spokenText, temporaryPath);
      if (
        fs.statSync(temporaryPath).size <= 2_000 ||
        fileDuration(temporaryPath) <= 0.2
      ) {
        throw new Error("语音文件为空或无法解码");
      }
      fs.renameSync(temporaryPath, audioPath);
      fs.writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            text: task.spokenText,
            voice: VOICE,
            rate: RATE,
            pitch: PITCH,
            outputFormat: OUTPUT_FORMAT,
          },
          null,
          2,
        ),
        "utf8",
      );
      return audioPath;
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      if (attempt === 4) throw error;
      console.error(`[Edge TTS] ${task.label} 失败：${error.message}`);
      await wait(1_300 * attempt);
    }
  }
  throw new Error(`无法生成 ${task.label}`);
}

async function runPool(tasks) {
  let cursor = 0;
  const results = new Array(tasks.length);
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await synthesizeOne(tasks[index]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENCY, tasks.length || 1) },
      () => worker(),
    ),
  );
  return results;
}

const tasks = [];
for (const scene of plan.scenes) {
  for (const [sentenceIndex, narration] of scene.narration.entries()) {
    tasks.push({
      sceneId: scene.id,
      sentenceIndex,
      spokenText: narration.spokenText,
      label: `${scene.id}/${String(sentenceIndex + 1).padStart(2, "0")}`,
    });
  }
}

let audioByKey = new Map();
if (ttsMode === "edge") {
  console.log(
    JSON.stringify({
      engine: "Edge TTS",
      voice: VOICE,
      rate: RATE,
      pitch: PITCH,
      sentenceCount: tasks.length,
      concurrency: CONCURRENCY,
      proxy: Boolean(PROXY),
    }),
  );
  const paths = await runPool(tasks);
  audioByKey = new Map(
    tasks.map((task, index) => [
      `${task.sceneId}/${task.sentenceIndex}`,
      paths[index],
    ]),
  );
}

const sceneTimeline = [];
const allPcm = [];
const srtCues = [];
const transcript = [
  plan.courseTitle,
  `配音：${ttsMode === "edge" ? `Edge TTS ${VOICE}` : "离线静音验收模式"}`,
  "",
];
let globalTime = 0;
let cueIndex = 1;

for (const [sceneIndex, scene] of plan.scenes.entries()) {
  const scenePcm = [silence(SCENE_LEAD_SECONDS)];
  let localTime = SCENE_LEAD_SECONDS;
  const sceneStart = globalTime;
  transcript.push(`【${sceneIndex + 1}】${scene.title}`);

  for (const [sentenceIndex, narration] of scene.narration.entries()) {
    let pcm;
    if (ttsMode === "edge") {
      const sourcePath = audioByKey.get(`${scene.id}/${sentenceIndex}`);
      const sceneSentenceDir = path.join(sentenceAudioDir, scene.id);
      fs.mkdirSync(sceneSentenceDir, { recursive: true });
      const wavPath = path.join(
        sceneSentenceDir,
        `${String(sentenceIndex).padStart(3, "0")}.wav`,
      );
      execFileSync(
        ffmpegPath,
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          sourcePath,
          "-ac",
          String(CHANNELS),
          "-ar",
          String(SAMPLE_RATE),
          "-c:a",
          "pcm_s16le",
          wavPath,
        ],
        { stdio: "inherit" },
      );
      pcm = parseWavData(fs.readFileSync(wavPath));
    } else {
      pcm = silence(silentSentenceDuration(narration.spokenText));
    }

    const duration = secondsFromPcm(pcm);
    const cueStart = globalTime + localTime;
    const cueEnd = cueStart + duration;
    scenePcm.push(pcm, silence(SENTENCE_GAP_SECONDS));
    srtCues.push({
      index: cueIndex,
      sceneId: scene.id,
      start: cueStart,
      end: cueEnd,
      text: narration.displayText,
    });
    cueIndex += 1;
    transcript.push(narration.displayText);
    localTime += duration + SENTENCE_GAP_SECONDS;
  }

  scenePcm.push(silence(SCENE_TAIL_SECONDS));
  const joinedScene = Buffer.concat(scenePcm);
  const sceneDuration = secondsFromPcm(joinedScene);
  fs.writeFileSync(
    path.join(audioDir, `${scene.id}.wav`),
    makeWav(joinedScene),
  );
  allPcm.push(joinedScene);
  sceneTimeline.push({
    index: sceneIndex,
    id: scene.id,
    type: scene.type,
    section: scene.section,
    title: scene.title,
    sourceSlides: scene.sourceSlides,
    slideImage: scene.slideImage,
    start: sceneStart,
    duration: sceneDuration,
    end: sceneStart + sceneDuration,
  });
  globalTime += sceneDuration;
  transcript.push("");
}

const fullPcm = Buffer.concat(allPcm);
const rawNarrationPath = path.join(audioDir, "narration-raw.wav");
const narrationPath = path.join(audioDir, "narration.m4a");
fs.writeFileSync(rawNarrationPath, makeWav(fullPcm));
execFileSync(
  ffmpegPath,
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    rawNarrationPath,
    ...(ttsMode === "edge"
      ? ["-af", "loudnorm=I=-16:LRA=7:TP=-1.5"]
      : []),
    "-ar",
    "48000",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    narrationPath,
  ],
  { stdio: "inherit" },
);

const srt = srtCues
  .map(
    (cue) =>
      `${cue.index}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`,
  )
  .join("\n");
fs.writeFileSync(path.join(jobDir, "captions.srt"), srt, "utf8");
fs.writeFileSync(
  path.join(jobDir, "transcript.txt"),
  `${transcript.join("\n")}\n`,
  "utf8",
);
writeJson(path.join(jobDir, "scene-timeline.json"), {
  schemaVersion: 1,
  engine: ttsMode === "edge" ? "Edge TTS" : "silent",
  voice: ttsMode === "edge" ? VOICE : null,
  rate: ttsMode === "edge" ? RATE : null,
  pitch: ttsMode === "edge" ? PITCH : null,
  sampleRate: SAMPLE_RATE,
  totalDuration: secondsFromPcm(fullPcm),
  cueCount: srtCues.length,
  scenes: sceneTimeline,
});
console.log(
  JSON.stringify({
    sceneCount: sceneTimeline.length,
    cueCount: srtCues.length,
    totalDuration: secondsFromPcm(fullPcm),
    narrationPath,
  }),
);

// node-edge-tts may leave closed WebSocket handles alive behind a proxy.
process.exit(0);

