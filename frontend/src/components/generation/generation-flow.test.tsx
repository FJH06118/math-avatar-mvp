import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenerationFlow } from "./generation-flow";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(), getJob: vi.fn(), createRenderJob: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: mocks.replace }) }));
vi.mock("@/lib/api/tracer-adapter", () => ({ getEnabledTracerApiAdapter: () => ({}) }));
vi.mock("@/lib/api", () => ({
  cancelJob: vi.fn(), createCompositeRenderJob: vi.fn(), createPageRenderJob: vi.fn(),
  createRenderJob: mocks.createRenderJob, getJob: mocks.getJob, retryJob: vi.fn(),
  getUserFacingErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.getJob.mockReset();
  mocks.createRenderJob.mockReset();
});

describe("stage 8 persistent generation flow", () => {
  it("resumes the supplied server task without creating a duplicate", async () => {
    mocks.getJob.mockResolvedValue({
      id: "task_stage8_audio", projectId: "project_stage8", type: "rendering", status: "running",
      progress: 50, currentStageId: "audio", currentSlideId: "slide_stage8_2",
      stages: [{ id: "audio", label: "合成语音与字幕", description: "服务端已完成 1/2 个工作单元。", status: "running", progress: 50 }],
      createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:01:00.000Z",
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GenerationFlow projectId="project_stage8" initialJobId="task_stage8_audio" initialAudioTaskId="task_stage8_audio" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("当前处理页面：slide_stage8_2")).toBeDefined();
    expect(screen.getAllByText("50%")).toHaveLength(2);
    expect(mocks.createRenderJob).not.toHaveBeenCalled();
  });
});
