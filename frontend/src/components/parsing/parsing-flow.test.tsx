import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ParsingFlow } from "./parsing-flow";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  getJob: vi.fn(),
  getParseSnapshot: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { alt: string; unoptimized?: boolean }) => {
    void unoptimized;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} {...props} />;
  },
}));

vi.mock("@/lib/api", () => ({
  cancelJob: vi.fn(),
  createParsingJob: vi.fn(),
  getJob: mocks.getJob,
  retryJob: vi.fn(),
  getEnabledTracerApiAdapter: () => ({ getParseSnapshot: mocks.getParseSnapshot }),
  getUserFacingErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.getJob.mockReset();
  mocks.getParseSnapshot.mockReset();
});

function renderFlow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ParsingFlow projectId="project_stage5" initialJobId="task_stage5" />
    </QueryClientProvider>,
  );
}

describe("ParsingFlow real parse evidence", () => {
  it("shows persisted original pages and warnings without auto redirect", async () => {
    mocks.getJob.mockResolvedValue({
      id: "task_stage5",
      projectId: "project_stage5",
      type: "parsing",
      status: "completed",
      progress: 100,
      currentStageId: "parse_pages",
      stages: [{
        id: "parse_pages",
        label: "解析课件并生成原页",
        description: "所有原页均已持久化。",
        status: "completed",
        progress: 100,
      }],
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:01:00.000Z",
    });
    mocks.getParseSnapshot.mockResolvedValue({
      task: { status: "SUCCEEDED" },
      slides: [{
        id: "slide_stage5_1",
        slideNumber: 1,
        title: "导数定义",
        formulaCount: 2,
        parseConfidence: 0.96,
        parseWarnings: ["检测到一个待人工核对的公式"],
        originalPage: { url: "/api/t/assets/asset_stage5_1/preview" },
      }],
    });

    renderFlow();

    expect(await screen.findByRole("img", { name: "第 1 页原页：导数定义" })).toBeDefined();
    expect(screen.getByText("检测到一个待人工核对的公式")).toBeDefined();
    expect(screen.getByRole("button", { name: "进入项目工作台" })).toBeDefined();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
