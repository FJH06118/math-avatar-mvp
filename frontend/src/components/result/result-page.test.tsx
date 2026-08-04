import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultPage } from "./result-page";

const mocks = vi.hoisted(() => ({ getRenderResult: vi.fn(), prepareRenderDownload: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({
  default: ({ alt = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} {...props} />;
  },
}));
vi.mock("@/lib/api", () => ({
  createRenderJob: vi.fn(), getRenderResult: mocks.getRenderResult,
  prepareRenderDownload: mocks.prepareRenderDownload,
  getUserFacingErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

beforeEach(() => {
  mocks.getRenderResult.mockReset();
  mocks.prepareRenderDownload.mockReset();
});

describe("stage 9 result delivery", () => {
  it("renders scoped media and validation evidence and refreshes metadata download", async () => {
    mocks.getRenderResult.mockResolvedValue({
      id: "result_task_stage9", projectId: "project_stage9", jobId: "task_stage9", title: "导数课程",
      videoUrl: "/api/t/assets/asset_video_stage9", mp4Url: "/api/t/assets/asset_video_stage9",
      captionTrackUrl: "/api/t/tasks/task_stage9/captions.vtt",
      srtUrl: "/api/t/assets/asset_srt_stage9", durationSeconds: 5, fileSizeBytes: 12000,
      resolution: "1920 × 1080", generatedAt: "2026-08-04T00:00:00.000Z", assetsAvailable: true,
      validation: { status: "passed", videoCodec: "h264", audioCodec: "aac", pixelFormat: "yuv420p", fps: 25,
        width: 1920, height: 1080, durationMs: 5000, expectedDurationMs: 5000, fastStart: true,
        fullDecode: true, nonSilent: true, meanVolumeDb: -21, peakVolumeDb: -18, maxBlackDurationMs: 0, pageCount: 3, pageCoverage: [1, 2, 3],
        obstructionClear: true, errors: [] },
    });
    mocks.prepareRenderDownload.mockImplementation(() => new Promise(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><ResultPage projectId="project_stage9" taskId="task_stage9" /></QueryClientProvider>);

    expect(await screen.findByText("媒体硬门验证")).toBeDefined();
    expect(screen.getByText("3/3")).toBeDefined();
    expect(document.querySelector("video source")?.getAttribute("src")).toBe("/api/t/assets/asset_video_stage9");
    expect(document.querySelector("video track")?.getAttribute("src")).toBe("/api/t/tasks/task_stage9/captions.vtt");
    fireEvent.click(screen.getByRole("button", { name: "下载项目元数据" }));
    await waitFor(() => expect(mocks.prepareRenderDownload).toHaveBeenCalledWith("project_stage9", "metadata", {}, "task_stage9"));
  });
});
