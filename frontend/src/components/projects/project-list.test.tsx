import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/types";

import { ProjectList } from "./project-list";

const project: Project = {
  id: "project-stage-3",
  title: "导数的几何意义",
  status: "ready",
  fileName: "中文导数课件.pptx",
  slideCount: 3,
  createdAt: "2026-08-04T00:00:00.000Z",
  updatedAt: "2026-08-04T01:00:00.000Z",
  uploadedFileId: "asset-stage-3",
  settings: {
    avatarId: "avatar-lin",
    voiceId: "voice-qinghe",
    speechRate: 1,
    captionsEnabled: true,
    captionStyle: "clear",
    avatarPosition: "right",
    background: "light",
  },
  version: 1,
};

const apiMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  copyProject: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  archiveProject: vi.fn(),
  copyProject: apiMocks.copyProject,
  deleteProject: vi.fn(),
  getUserFacingErrorMessage: (_error: unknown, fallback: string) => fallback,
  listProjects: apiMocks.listProjects,
}));

beforeEach(() => {
  apiMocks.listProjects.mockReset().mockResolvedValue([project]);
  apiMocks.copyProject
    .mockReset()
    .mockResolvedValue({ ...project, id: "project-copy" });
});

function renderProjectList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectList />
    </QueryClientProvider>,
  );
}

describe("ProjectList", () => {
  it("forwards search to the adapter and copies through the same boundary", async () => {
    renderProjectList();

    expect(await screen.findByText("导数的几何意义")).toBeDefined();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索项目" }), {
      target: { value: "导数" },
    });
    await waitFor(() =>
      expect(apiMocks.listProjects).toHaveBeenCalledWith(
        expect.objectContaining({ search: "导数" }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "复制项目：导数的几何意义" }));
    await waitFor(() =>
      expect(apiMocks.copyProject).toHaveBeenCalledWith(
        "project-stage-3",
        expect.objectContaining({ idempotencyKey: expect.stringMatching(/^copy_/) }),
      ),
    );
    expect(await screen.findByText(/已创建.*副本/)).toBeDefined();
  });
});
