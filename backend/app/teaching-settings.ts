import {
  TeachingSettingsSchema,
  type TeachingSettings,
} from "@ppt-digital-human/contracts";

const SUPPORTED_AVATAR_ID = "avatar-zhou";
const SUPPORTED_VOICE_IDS = new Set([
  "voice-qinghe",
  "voice-zhiyuan",
  "voice-mingxi",
]);

export function normalizeSupportedTeachingSettings(
  raw: TeachingSettings,
): TeachingSettings {
  const settings = TeachingSettingsSchema.parse(raw);
  return TeachingSettingsSchema.parse({
    ...settings,
    avatarId: SUPPORTED_AVATAR_ID,
    voiceId: SUPPORTED_VOICE_IDS.has(settings.voiceId)
      ? settings.voiceId
      : "voice-qinghe",
    speechRate: Math.min(1.5, Math.max(0.75, settings.speechRate)),
    captionsEnabled: true,
    captionStyle: "clear",
    avatarPosition: "right",
    background: "light",
    slideOverrides: settings.slideOverrides?.filter(
      (override) => override.avatarPosition === "hidden",
    ),
  });
}
