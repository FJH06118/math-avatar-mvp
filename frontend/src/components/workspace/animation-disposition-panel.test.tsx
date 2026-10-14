import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnimationDispositionReview,
  LessonPlanRevision,
} from "@ppt-digital-human/contracts";

import {
  ACCEPT_STATIC_COPY,
  AnimationDispositionPanel,
} from "./animation-disposition-panel";

const { decide, getDisposition, getLessonPlans } = vi.hoisted(() => ({
  decide: vi.fn(),
  getDisposition: vi.fn(),
  getLessonPlans: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  decideTracerAnimationDisposition: decide,
  getTracerAnimationDisposition: getDisposition,
  getTracerLessonPlans: getLessonPlans,
  getUserFacingErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const MANIFEST_HASH = "a".repeat(64);

function reviewWithAnimation(): AnimationDispositionReview {
  return {
    presentationId: "presentation_1",
    manifestHash: MANIFEST_HASH,
    pendingSlideIds: ["slide_1"],
    selectableModes: ["ACCEPT_STATIC"],
    report: {
      animatedSlideCount: 1,
      nativePreservedSlideCount: 0,
      acceptedStaticSlideCount: 0,
      metadataUnavailableSlideCount: 0,
    },
    slides: [
      {
        slideId: "slide_1",
        slideNumber: 1,
        manifestHash: MANIFEST_HASH,
        metadataSource: "POWERPOINT_COM",
        effectCount: 3,
        sequenceKinds: ["MAIN"],
        supportLevels: ["METADATA_SUPPORTED", "REBUILD_WHITELIST"],
        supportSummary: "本页含 3 个自动计时效果。",
        warnings: [],
        hasAnimationFacts: true,
        disposition: null,
        dispositionCurrent: false,
      },
      {
        slideId: "slide_2",
        slideNumber: 2,
        manifestHash: MANIFEST_HASH,
        metadataSource: "POWERPOINT_COM",
        effectCount: 0,
        sequenceKinds: [],
        supportLevels: ["METADATA_SUPPORTED"],
        supportSummary: "本页无动画。",
        warnings: [],
        hasAnimationFacts: false,
        disposition: null,
        dispositionCurrent: false,
      },
    ],
  };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnimationDispositionPanel projectId="project_1" enabled onSelectSlide={() => {}} />
    </QueryClientProvider>,
  );
}

describe("M1 animation disposition panel", () => {
  beforeEach(() => {
    decide.mockReset();
    getDisposition.mockReset();
    getLessonPlans.mockReset();
    getDisposition.mockResolvedValue(reviewWithAnimation());
    getLessonPlans.mockResolvedValue([
      {
        id: "revision_1",
        slideId: "slide_1",
        revision: 4,
        approval: { status: "approved" },
      } as unknown as LessonPlanRevision,
    ]);
  });

  it("逐页展示效果数、序列类别、支持评估与警告，并给出待选择提示", async () => {
    renderPanel();

    expect(await screen.findByText("动画处置")).toBeTruthy();
    expect(screen.getByText("1 页待选择")).toBeTruthy();
    expect(screen.getByText("3 个动画效果")).toBeTruthy();
    expect(screen.getByText("主序列")).toBeTruthy();
    expect(screen.getByText(/本页含 3 个自动计时效果。/)).toBeTruthy();
    // 逐页支持评估的等级说明
    expect(screen.getByText(/动画元数据可读取/)).toBeTruthy();
    // 只展示含动画的页面
    expect(screen.queryByText("本页无动画。")).toBeNull();
    // 结果报告计数
    expect(screen.getByText(/含动画 1 页/)).toBeTruthy();
    // 可选模式只包含"接受静态"
    expect(screen.getByText(/已确认接受静态成片/)).toBeTruthy();
  });

  it("接受静态的文案明确说明最终视频不会播放本页动画", async () => {
    renderPanel();
    await screen.findByText("动画处置");

    // 常量本身必须写清后果，避免用户误解为"动画已保留"
    expect(ACCEPT_STATIC_COPY).toContain("最终视频不会播放本页动画");
    expect(screen.getByText("含动画的页面必须先选择处置方式，否则无法生成视频")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "接受静态成片（本页动画不会播放）" }),
    ).toBeTruthy();
  });

  it("必须填写依据后才能提交，提交时带上当前修订号", async () => {
    decide.mockResolvedValue({} as LessonPlanRevision);
    renderPanel();
    await screen.findByText("动画处置");

    fireEvent.click(screen.getByRole("button", { name: "接受静态成片（本页动画不会播放）" }));

    const submit = screen.getByRole("button", { name: "确认接受静态成片" }) as HTMLButtonElement;
    // 未填依据时禁用，避免产生无依据的处置记录
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("依据（必填，会记入该页修订）"), {
      target: { value: "该页动画仅作装饰，静态原页已能表达教学内容。" },
    });
    await waitFor(() => expect(submit.disabled).toBe(false));

    fireEvent.click(submit);

    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(decide).toHaveBeenCalledWith("revision_1", {
      expectedRevision: 4,
      mode: "ACCEPT_STATIC",
      reason: "该页动画仅作装饰，静态原页已能表达教学内容。",
    });
  });

  it("enabled 为 false（Mock 模式）时不渲染面板", () => {
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AnimationDispositionPanel projectId="project_1" enabled={false} />
      </QueryClientProvider>,
    );
    expect(container.textContent).toBe("");
    expect(getDisposition).not.toHaveBeenCalled();
  });
});
