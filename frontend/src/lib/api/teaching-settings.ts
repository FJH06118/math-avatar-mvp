import type { TeachingSettings } from "@/types";

export const SUPPORTED_AVATAR_ID = "avatar-zhou" as const;
export const SUPPORTED_VOICE_IDS = [
  "voice-qinghe",
  "voice-zhiyuan",
  "voice-mingxi",
] as const;

const DEFAULT_VOICE_ID = SUPPORTED_VOICE_IDS[0];

export function normalizeSupportedTeachingSettings(
  settings: TeachingSettings,
): TeachingSettings {
  const voiceId = SUPPORTED_VOICE_IDS.includes(
    settings.voiceId as (typeof SUPPORTED_VOICE_IDS)[number],
  )
    ? settings.voiceId
    : DEFAULT_VOICE_ID;
  const speechRate = Math.min(1.5, Math.max(0.75, settings.speechRate));
  return {
    ...settings,
    avatarId: SUPPORTED_AVATAR_ID,
    voiceId,
    speechRate,
    captionsEnabled: true,
    captionStyle: "clear",
    avatarPosition: "right",
    background: "light",
    slideOverrides: settings.slideOverrides?.flatMap((override) =>
      override.avatarPosition === "hidden"
        ? [override]
        : [],
    ),
  };
}

export function edgeVoiceFor(voiceId: string): string {
  return {
    "voice-qinghe": "zh-CN-XiaoxiaoNeural",
    "voice-zhiyuan": "zh-CN-YunyangNeural",
    "voice-mingxi": "zh-CN-XiaoyiNeural",
  }[voiceId] ?? "zh-CN-XiaoxiaoNeural";
}

export function edgeRateFor(speechRate: number): string {
  const percentage = Math.round((speechRate - 1) * 100);
  return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

export function edgePitchFor(voiceId: string): string {
  return {
    "voice-qinghe": "+0Hz",
    "voice-zhiyuan": "-2Hz",
    "voice-mingxi": "+2Hz",
  }[voiceId] ?? "+0Hz";
}
