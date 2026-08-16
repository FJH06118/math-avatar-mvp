import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { EdgeTTS } = require("node-edge-tts");

let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const tts = new EdgeTTS({
  voice: request.voice,
  lang: "zh-CN",
  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
  saveSubtitles: true,
  rate: request.rate,
  pitch: request.pitch,
  volume: "+0%",
  timeout: 90_000,
});
await tts.ttsPromise(request.text, request.outputPath);
