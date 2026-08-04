import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UploadFlow } from "./upload-flow";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  uploadPresentation: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/api", () => ({
  createParsingJob: vi.fn(),
  createProject: vi.fn(),
  getEnabledTracerApiAdapter: () => ({
    uploadPresentation: mocks.uploadPresentation,
  }),
  getUserFacingErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  uploadPresentation: vi.fn(),
}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.uploadPresentation.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderUploadFlow() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UploadFlow />
    </QueryClientProvider>,
  );
}

function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("File input was not rendered.");
  fireEvent.change(input, { target: { files: [file] } });
}

describe("UploadFlow real adapter", () => {
  it("opens the native file picker once from the visible choose-file button", () => {
    const inputClick = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderUploadFlow();

    fireEvent.click(screen.getByRole("button", { name: "选择文件" }));

    expect(inputClick).toHaveBeenCalledTimes(1);
  });

  it("uploads once through the real multipart adapter and reuses its task receipt", async () => {
    mocks.uploadPresentation.mockResolvedValue({
      project: { id: "project-stage-4" },
      task: { id: "task-stage-4" },
    });
    const { container } = renderUploadFlow();
    const file = new File(["pptx"], "中文导数课件.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    selectFile(container, file);

    fireEvent.click(await screen.findByRole("button", { name: "开始上传" }));
    await waitFor(() => expect(mocks.uploadPresentation).toHaveBeenCalledOnce());
    expect(mocks.uploadPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        file,
        title: "中文导数课件",
        idempotencyKey: expect.stringMatching(/^upload_/),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByText("课件上传成功")).toBeDefined();
  });

  it("aborts the in-flight request and keeps the selected file for retry", async () => {
    mocks.uploadPresentation.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("上传已取消", "AbortError")),
            { once: true },
          );
        }),
    );
    const { container } = renderUploadFlow();
    selectFile(
      container,
      new File(["pptx"], "可取消课件.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "开始上传" }));
    fireEvent.click(await screen.findByRole("button", { name: "取消上传" }));

    expect(await screen.findByText("上传已取消")).toBeDefined();
    expect(screen.getByText("可取消课件.pptx")).toBeDefined();
  });
});
