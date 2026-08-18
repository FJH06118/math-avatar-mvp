import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  previewFailureMessage,
  previewIdempotencyKey,
  TeachingSettingsForm,
} from "./teaching-settings-form";

const { getEnabledTracerApiAdapter, getVoicePreview } = vi.hoisted(() => ({
  getEnabledTracerApiAdapter: vi.fn(() => null),
  getVoicePreview: vi.fn().mockResolvedValue({ voiceId: "voice-qinghe", previewUrl: "/api/mock/voices/voice-qinghe/preview?rate=1.25", playbackRate: 1.25 }),
}));

vi.mock("@/lib/api", () => ({
  getVoicePreview,
  updateTeachingSettings: vi.fn(),
}));
vi.mock("@/lib/api/tracer-adapter", () => ({ getEnabledTracerApiAdapter }));

describe("stage 7 teaching settings", () => {
  beforeEach(() => {
    getEnabledTracerApiAdapter.mockReset();
    getEnabledTracerApiAdapter.mockReturnValue(null);
    getVoicePreview.mockClear();
  });

  it("publishes preview settings without creating a parent update loop", async () => {
    function PreviewHarness() {
      const [previewAvatarId, setPreviewAvatarId] = useState("pending");
      return (
        <>
          <TeachingSettingsForm
            projectId="project_stage7"
            presentationId="presentation_stage7"
            settings={{
              avatarId: "avatar-zhou", voiceId: "voice-qinghe", speechRate: 1.25,
              captionsEnabled: true, captionStyle: "clear", avatarPosition: "right", background: "light",
            }}
            avatars={[{ id: "avatar-zhou", name: "周老师", description: "教师", genderPresentation: "male" }]}
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
      expect(screen.getByLabelText("预览教师").textContent).toBe("avatar-zhou"),
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
            avatarId: "avatar-zhou", voiceId: "voice-qinghe", speechRate: 1.25,
            captionsEnabled: true, captionStyle: "clear", avatarPosition: "right", background: "light",
          }}
          avatars={[{ id: "avatar-zhou", name: "周老师", description: "教师", genderPresentation: "male" }]}
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

  it("does not call Edge TTS before an initial lesson plan exists", () => {
    const createVoicePreviewTask = vi.fn();
    getEnabledTracerApiAdapter.mockReturnValue({ createVoicePreviewTask } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TeachingSettingsForm
          projectId="project_stage7"
          presentationId="presentation_stage7"
          settings={{
            avatarId: "avatar-zhou", voiceId: "voice-qinghe", speechRate: 1.25,
            captionsEnabled: true, captionStyle: "clear", avatarPosition: "right", background: "light",
          }}
          avatars={[{ id: "avatar-zhou", name: "周老师", description: "教师", genderPresentation: "male" }]}
          voices={[{ id: "voice-qinghe", name: "清和", description: "清晰自然", locale: "zh-CN", genderPresentation: "female" }]}
          onSaveStateChange={vi.fn()}
          onValidityChange={vi.fn()}
          selectedSlideId="slide_stage7_1"
          selectedSlideTitle="导数定义"
          previewAvailable={false}
          previewUnavailableReason="请先重试规划并生成初始讲稿；当前尚未调用 Edge TTS。"
        />
      </QueryClientProvider>,
    );

    expect((screen.getByRole("button", { name: "试听" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("请先重试规划并生成初始讲稿；当前尚未调用 Edge TTS。")).toBeDefined();
    expect(createVoicePreviewTask).not.toHaveBeenCalled();
  });

  it("shows a classified Edge failure and retries with the failed task as an idempotency anchor", async () => {
    const createVoicePreviewTask = vi.fn()
      .mockResolvedValueOnce({ id: "task_preview_failed" })
      .mockResolvedValueOnce({ id: "task_preview_retry" });
    const getTask = vi.fn().mockResolvedValue({
      id: "task_preview_failed",
      status: "FAILED",
      errorCode: "EDGE_TTS_CONNECTION_FAILED",
    });
    getEnabledTracerApiAdapter.mockReturnValue({
      createVoicePreviewTask,
      getTask,
      getAudioTimeline: vi.fn(),
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TeachingSettingsForm
          projectId="project_stage7"
          presentationId="presentation_stage7"
          settings={{
            avatarId: "avatar-zhou", voiceId: "voice-qinghe", speechRate: 1.25,
            captionsEnabled: true, captionStyle: "clear", avatarPosition: "right", background: "light",
          }}
          avatars={[{ id: "avatar-zhou", name: "周老师", description: "教师", genderPresentation: "male" }]}
          voices={[{ id: "voice-qinghe", name: "清和", description: "清晰自然", locale: "zh-CN", genderPresentation: "female" }]}
          onSaveStateChange={vi.fn()}
          onValidityChange={vi.fn()}
          selectedSlideId="slide_stage7_1"
          selectedSlideTitle="导数定义"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "试听" }));
    expect(await screen.findByText(/Edge TTS 网络连接失败/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "重试听读" }));
    await waitFor(() => expect(createVoicePreviewTask).toHaveBeenCalledTimes(2));
    expect(createVoicePreviewTask.mock.calls[0]?.[1].idempotencyKey).toBe(
      previewIdempotencyKey("presentation_stage7", "voice-qinghe", 1.25),
    );
    expect(createVoicePreviewTask.mock.calls[1]?.[1].idempotencyKey).toBe(
      "preview_retry_task_preview_failed",
    );
    expect(previewFailureMessage("AUDIO_UNDECODABLE")).toContain("音频未通过校验");
  });
});
