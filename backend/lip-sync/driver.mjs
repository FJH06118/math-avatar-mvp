import { createHash } from "node:crypto";
import { pinyin } from "pinyin-pro";

export const DRIVER_VERSION = "lip-sync-driver-v1";
export const CONFIG_VERSION = "lip-sync-config-v1";
const OPENING = { CLOSED: 0, SMALL: 1, MEDIUM: 2, LARGE: 3, ROUND: 2 };
const ROUND_FINALS = new Set(["u", "v", "ü", "o", "ou", "ong", "uo", "un", "ui", "uan", "uang", "ue", "üe", "van", "üan", "vn", "ün", "iong", "iu"]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function sha256Canonical(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

export function generateLipSyncTimeline(input) {
  validateInput(input);
  const totalFrames = Math.max(1, Math.round(input.durationMs * input.fps / 1000));
  const frameMs = 1000 / input.fps;
  const db = Array.from({ length: totalFrames }, (_, frame) => {
    const rms = frameRms(input.samples, input.sampleRateHz, (frame + 0.5) * frameMs);
    return rms > 0 ? 20 * Math.log10(rms / 32768) : -100;
  });
  const sorted = [...db].sort((a, b) => a - b);
  const noise = clamp(percentile(sorted, 0.2), -65, -38);
  const peak = clamp(percentile(sorted, 0.9), -32, -8);
  const speechThreshold = Math.min(-24, noise + Math.max(7, (peak - noise) * 0.22));
  const mediumThreshold = speechThreshold + Math.max(3, (peak - speechThreshold) * 0.38);
  const largeThreshold = speechThreshold + Math.max(7, (peak - speechThreshold) * 0.72);
  const timing = normalizeTiming(input.wordTiming, input.durationMs);
  const mode = timing ? "BOUNDARY_ENERGY" : "ENERGY_ONLY";
  const targets = db.map((value, frame) => {
    const atMs = (frame + 0.5) * frameMs;
    const boundary = timing?.find((item) => atMs >= Math.max(0, item.startMs - frameMs) && atMs < Math.min(input.durationMs, item.endMs + frameMs));
    if (mode === "BOUNDARY_ENERGY" && !boundary) return "CLOSED";
    if (value < speechThreshold) return "CLOSED";
    const amplitude = value >= largeThreshold ? "LARGE" : value >= mediumThreshold ? "MEDIUM" : "SMALL";
    return boundary && value >= speechThreshold + 2 && hasReliableRoundedSyllable(boundary.text) ? "ROUND" : amplitude;
  });
  const poses = smoothTargets(targets, input.fps);
  const runs = toRuns(poses);
  const poseFrameCounts = { CLOSED: 0, SMALL: 0, MEDIUM: 0, LARGE: 0, ROUND: 0 };
  poses.forEach((pose) => { poseFrameCounts[pose] += 1; });
  const maximumOpeningStep = poses.slice(1).reduce((maximum, pose, index) => Math.max(maximum, Math.abs(OPENING[pose] - OPENING[poses[index]])), 0);
  const voicedFrames = poses.filter((pose) => pose !== "CLOSED").length;
  const normalizedInput = {
    samplesSha256: createHash("sha256").update(Buffer.from(input.samples.buffer, input.samples.byteOffset, input.samples.byteLength)).digest("hex"),
    sampleRateHz: input.sampleRateHz, durationMs: input.durationMs, fps: input.fps, wordTiming: timing ?? null,
    driverVersion: DRIVER_VERSION, configVersion: CONFIG_VERSION,
  };
  const inputHash = sha256Canonical(normalizedInput);
  const timeline = {
    schemaVersion: "lip-sync-timeline-v1", driverVersion: DRIVER_VERSION, configVersion: CONFIG_VERSION,
    fps: input.fps, durationMs: input.durationMs, totalFrames, mode, runs, inputHash,
    statistics: {
      poseFrameCounts, boundaryCount: timing?.length ?? 0,
      boundaryCoverage: timing ? coveredDuration(timing, input.durationMs) / input.durationMs : 0,
      roundCoverage: voicedFrames ? poseFrameCounts.ROUND / voicedFrames : 0,
      maximumOpeningStep, longestSilenceCloseResponseMs: measureCloseResponse(targets, poses, frameMs, 160),
    },
  };
  return { ...timeline, timelineHash: sha256Canonical(timeline) };
}

function validateInput(input) {
  if (!(input.samples instanceof Int16Array) || input.samples.length === 0) throw new Error("LIP_SYNC_PCM_INVALID");
  if (!Number.isInteger(input.sampleRateHz) || input.sampleRateHz <= 0) throw new Error("LIP_SYNC_SAMPLE_RATE_INVALID");
  if (![12, 25, 30].includes(input.fps) || !Number.isInteger(input.durationMs) || input.durationMs <= 0) throw new Error("LIP_SYNC_TIMEBASE_INVALID");
  if (Math.abs(input.samples.length * 1000 / input.sampleRateHz - input.durationMs) > 1000 / input.fps) throw new Error("LIP_SYNC_DURATION_MISMATCH");
}

function normalizeTiming(value, durationMs) {
  if (!value || value.status !== "AVAILABLE" || !Array.isArray(value.boundaries) || value.boundaries.length === 0) return null;
  let previousEnd = 0;
  const output = [];
  for (const boundary of value.boundaries) {
    if (!boundary || typeof boundary.text !== "string" || !boundary.text.trim() || !Number.isInteger(boundary.startMs) || !Number.isInteger(boundary.endMs) || boundary.startMs < previousEnd || boundary.startMs < 0 || boundary.endMs <= boundary.startMs || boundary.endMs > durationMs + 40) return null;
    output.push({ text: boundary.text.trim(), startMs: boundary.startMs, endMs: Math.min(boundary.endMs, durationMs) });
    previousEnd = boundary.endMs;
  }
  return output;
}

function hasReliableRoundedSyllable(text) {
  if (!/[\u3400-\u9fff]/u.test(text)) return false;
  return pinyin(text, { toneType: "none", type: "array", v: true, nonZh: "removed" }).some((syllable) => {
    const normalized = syllable.toLowerCase().replace(/[1-5]/g, "");
    return [...ROUND_FINALS].some((final) => normalized.endsWith(final));
  });
}

function frameRms(samples, sampleRate, centerMs) { const half = Math.round(sampleRate * 0.02); const center = Math.round(centerMs * sampleRate / 1000); const start = Math.max(0, center - half); const end = Math.min(samples.length, center + half); let energy = 0; for (let i = start; i < end; i += 1) energy += samples[i] * samples[i]; return end > start ? Math.sqrt(energy / (end - start)) : 0; }
function smoothTargets(targets, fps) { const output = []; let current = "CLOSED"; let silenceFrames = 0; for (const target of targets) { silenceFrames = target === "CLOSED" ? silenceFrames + 1 : 0; let desired = silenceFrames * 1000 / fps >= 160 ? "CLOSED" : target; const step = OPENING[desired] - OPENING[current]; if (Math.abs(step) > 1) desired = step > 0 ? poseForLevel(OPENING[current] + 1) : poseForLevel(OPENING[current] - 1); if (desired === "ROUND" && current === "CLOSED") desired = "SMALL"; output.push(desired); current = desired; } return output; }
function poseForLevel(level) { return ["CLOSED", "SMALL", "MEDIUM", "LARGE"][clamp(level, 0, 3)]; }
function toRuns(poses) { const runs = []; poses.forEach((pose, index) => { const last = runs.at(-1); if (last?.pose === pose) last.endFrame = index + 1; else runs.push({ startFrame: index, endFrame: index + 1, pose }); }); return runs; }
function percentile(values, fraction) { return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))] ?? -100; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function coveredDuration(boundaries, durationMs) { return boundaries.reduce((sum, item) => sum + Math.max(0, Math.min(item.endMs, durationMs) - item.startMs), 0); }
function measureCloseResponse(targets, poses, frameMs, sustainedMs) { let worst = 0; const requiredFrames = Math.ceil(sustainedMs / frameMs); for (let i = 0; i < targets.length; i += 1) if (targets[i] === "CLOSED" && (i === 0 || targets[i - 1] !== "CLOSED")) { let end = i; while (end < targets.length && targets[end] === "CLOSED") end += 1; if (end - i < requiredFrames) continue; let j = i + requiredFrames - 1; while (j < poses.length && poses[j] !== "CLOSED") j += 1; worst = Math.max(worst, Math.round(Math.max(0, j - (i + requiredFrames - 1)) * frameMs)); } return worst; }
