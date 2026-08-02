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
  options: MockRequestOptions = {},
): Promise<{ voiceId: string; durationMs: number }> {
  await simulateRequest(options, 280);
  const voice = mockDb.voices.find((item) => item.id === voiceId);
  if (!voice) {
    throw new Error("声音不存在。");
  }
  return { voiceId, durationMs: 4_000 };
}
