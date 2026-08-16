import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { TeachingSettingsForm } from "./teaching-settings-form";

const { getVoicePreview } = vi.hoisted(() => ({
  getVoicePreview: vi.fn().mockResolvedValue({ voiceId: "voice-qinghe", previewUrl: "/api/mock/voices/voice-qinghe/preview?rate=1.25", playbackRate: 1.25 }),
}));

vi.mock("@/lib/api", () => ({
  getVoicePreview,
  updateTeachingSettings: vi.fn(),
}));

describe("stage 7 teaching settings", () => {
  it("publishes preview settings without creating a parent update loop", async () => {
    function PreviewHarness() {
      const [previewAvatarId, setPreviewAvatarId] = useState("pending");
      return (
        <>
          <TeachingSettingsForm
            projectId="project_stage7"
            presentationId="presentation_stage7"
            settings={{
              avatarId: "avatar-teacher-lin", voiceId: "voice-qinghe", speechRate: 1.25,
              captionsEnabled: true, captionStyle: "clear", avatarPosition: "right", background: "light",
            }}
            avatars={[{ id: "avatar-teacher-lin", name: "林老师", description: "教师", genderPresentation: "female" }]}
            voices={[{ id: "voice-qinghe", name: "清和", description: "清晰自然", locale: "zh-CN", genderPresentation: "female" }]}
            onSaveStateChange={vi.fn()}
            onValidityChange={vi.fn()}
            onPreviewSettingsChange={(nextSettings) => setPreviewAvatarId(nextSettings.avatarId)}
            selectedSlideId="slide_stage7_1"
            selectedSlideTitle="导数定义"
          />
          <output aria-label="预览教师">{previewAvatarId}</output>
        </>
      );
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PreviewHarness />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("预览教师").textContent).toBe("avatar-teacher-lin"),
    );
  });

  it("starts and stops a voice preview without changing settings", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TeachingSettingsForm
          projectId="project_stage7"
          presentationId="presentation_stage7"
          settings={{
            avatarId: "avatar-teacher-lin", voiceId: "voice-qinghe", speechRate: 1.25,
            captionsEnabled: true, captionStyle: "clear", avatarPosition: "right", background: "light",
          }}
          avatars={[{ id: "avatar-teacher-lin", name: "林老师", description: "教师", genderPresentation: "female" }]}
          voices={[{ id: "voice-qinghe", name: "清和", description: "清晰自然", locale: "zh-CN", genderPresentation: "female" }]}
          onSaveStateChange={vi.fn()}
          onValidityChange={vi.fn()}
          selectedSlideId="slide_stage7_1"
          selectedSlideTitle="导数定义"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "试听" }));
    await waitFor(() => expect(getVoicePreview).toHaveBeenCalledWith("voice-qinghe", 1.25));
    const audio = document.querySelector("audio");
    expect(audio).not.toBeNull();
    fireEvent.loadedMetadata(audio!);
    expect(audio!.playbackRate).toBe(1.25);
    const stop = await screen.findByRole("button", { name: "停止" });
    fireEvent.click(stop);
    expect(screen.getByRole("button", { name: "试听" })).toBeDefined();
  });
});
