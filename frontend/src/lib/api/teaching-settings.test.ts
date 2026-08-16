import { describe, expect, it } from "vitest";

import {
  edgePitchFor,
  edgeRateFor,
  edgeVoiceFor,
  normalizeSupportedTeachingSettings,
} from "./teaching-settings";

describe("P4 supported teaching settings", () => {
  it("canonicalizes settings to the renderer-supported Zhou teacher and hidden-only overrides", () => {
    expect(
      normalizeSupportedTeachingSettings({
        avatarId: "avatar-lin",
        voiceId: "voice-unknown",
        speechRate: 1.8,
        captionsEnabled: false,
        captionStyle: "minimal",
        avatarPosition: "left",
        background: "board",
        slideOverrides: [
          { slideId: "slide-1", avatarPosition: "left" },
          { slideId: "slide-2", avatarPosition: "hidden" },
        ],
      }),
    ).toEqual({
      avatarId: "avatar-zhou",
      voiceId: "voice-qinghe",
      speechRate: 1.5,
      captionsEnabled: true,
      captionStyle: "clear",
      avatarPosition: "right",
      background: "light",
      slideOverrides: [{ slideId: "slide-2", avatarPosition: "hidden" }],
    });
  });

  it("uses one Edge mapping for preview and the frozen audio request", () => {
    expect(edgeVoiceFor("voice-zhiyuan")).toBe("zh-CN-YunyangNeural");
    expect(edgeRateFor(1.1)).toBe("+10%");
    expect(edgePitchFor("voice-zhiyuan")).toBe("-2Hz");
  });
});
