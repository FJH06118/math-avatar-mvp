import type { MockRequestOptions, Voice } from "@/types";

import { mockDb } from "./mock-client";
import { parseVoices } from "./contracts";
import { simulateRequest } from "./shared";

export async function listVoices(
  options: MockRequestOptions = {},
): Promise<Voice[]> {
  await simulateRequest(options, 520);
  return parseVoices(structuredClone(mockDb.voices));
}

export async function getVoicePreview(
  voiceId: string,
  speechRate: number,
  options: MockRequestOptions = {},
): Promise<{ voiceId: string; previewUrl: string; playbackRate: number }> {
  await simulateRequest(options, 280);
  const voice = mockDb.voices.find((item) => item.id === voiceId);
  if (!voice) {
    throw new Error("声音不存在。");
  }
  if (!Number.isFinite(speechRate) || speechRate < 0.75 || speechRate > 1.5) {
    throw new Error("试听语速不合法。");
  }
  return {
    voiceId,
    previewUrl: `/api/mock/voices/${encodeURIComponent(voiceId)}/preview?rate=${speechRate.toFixed(2)}`,
    playbackRate: speechRate,
  };
}
