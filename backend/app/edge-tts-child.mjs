import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { EdgeTTS } = require("node-edge-tts");

try {
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
} catch (error) {
  process.stderr.write(JSON.stringify({
    type: "edge-tts-error",
    protocolVersion: 1,
    code: classifyEdgeTtsError(error),
  }));
  process.exitCode = 1;
}

function classifyEdgeTtsError(error) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "AbortError" || code === "ETIMEDOUT" || /timed?\s*out|timeout/i.test(message)) {
    return "EDGE_TTS_TIMEOUT";
  }
  if (
    ["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN"].includes(code) ||
    /connect|network|socket|websocket|dns|fetch failed/i.test(message)
  ) {
    return "EDGE_TTS_CONNECTION_FAILED";
  }
  return "EDGE_TTS_UPSTREAM_FAILED";
}
