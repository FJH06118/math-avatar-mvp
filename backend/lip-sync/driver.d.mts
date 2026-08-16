import type { LipSyncTimeline, WordTimingCapture } from "@ppt-digital-human/contracts";
export const DRIVER_VERSION: string;
export const CONFIG_VERSION: string;
export function canonicalJson(value: unknown): string;
export function sha256Canonical(value: unknown): string;
export function generateLipSyncTimeline(input: { samples: Int16Array; sampleRateHz: number; durationMs: number; fps: 12 | 25 | 30; wordTiming?: WordTimingCapture | null }): LipSyncTimeline;
