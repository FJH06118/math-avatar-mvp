import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ParsedSlide } from "@/types";

import { SlideContentTabs } from "./slide-content-tabs";

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

const slide: ParsedSlide = {
  id: "slide_stage6_1",
  projectId: "project_stage6",
  presentationId: "presentation_stage6",
  slideNumber: 1,
  title: "导数定义",
  summary: "理解导数。",
  extractedText: "导数是变化率。",
  teachingScript: "讲解导数。",
  originalPageUrl: "/api/t/assets/asset_stage6_page_1/preview",
  sourceAssetId: "asset_stage6_page_1",
  renderAssetId: "asset_stage6_page_1",
  formulas: [],
  criticalRegions: [],
  safeRegions: [],
  parseConfidence: 0.99,
  parseWarnings: [],
  reviewFlags: [],
  isSkipped: false,
  revision: 2,
  lessonPlanRevisionId: "revision_stage6_2",
  lessonPlanRevision: 2,
  lessonPlanApproval: "pending",
  preservationMode: "FULL_PRESERVE",
  derivationSteps: ["先写出差商。"],
  sceneCount: 1,
  isLocked: true,
  updatedAt: "2026-08-04T00:00:00.000Z",
};

describe("stage 6 workspace slide", () => {
  it("defaults to the persisted original page and protects locked scripts", () => {
    const onLockChange = vi.fn();
    render(
      <SlideContentTabs
        slide={slide}
        displayText={slide.teachingScript}
        spokenText={slide.teachingScript}
        activeTab="preview"
        onTabChange={vi.fn()}
        onDisplayTextChange={vi.fn()}
        onSpokenTextChange={vi.fn()}
        onLockChange={onLockChange}
      />,
    );

    expect(screen.getByRole("img", { name: "第 1 页原页：导数定义" })).toBeDefined();
    expect(screen.getByText("完整保留原页")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "解锁本页" }));
    expect(onLockChange).toHaveBeenCalledWith(false);
  });

  it("requires an explicit approval action for pending revisions", () => {
    const onApprove = vi.fn();
    render(
      <SlideContentTabs
        slide={slide}
        displayText={slide.teachingScript}
        spokenText={slide.teachingScript}
        activeTab="preview"
        onTabChange={vi.fn()}
        onDisplayTextChange={vi.fn()}
        onSpokenTextChange={vi.fn()}
        onApprove={onApprove}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "批准本页讲稿" }));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it("switches the digital teacher shown in the page preview", () => {
    const props = {
      slide,
      displayText: slide.teachingScript,
      spokenText: slide.teachingScript,
      activeTab: "preview" as const,
      onTabChange: vi.fn(),
      onDisplayTextChange: vi.fn(),
      onSpokenTextChange: vi.fn(),
      avatarPosition: "right" as const,
    };
    const { rerender } = render(
      <SlideContentTabs
        {...props}
        avatar={{
          id: "avatar-lin",
          name: "林老师",
          description: "沉稳亲切",
          imageUrl: "/images/avatars/avatar-lin.png",
          genderPresentation: "female",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "林老师画面预览" })).toBeDefined();

    rerender(
      <SlideContentTabs
        {...props}
        avatar={{
          id: "avatar-yan",
          name: "严老师",
          description: "中性专业",
          imageUrl: "/images/avatars/avatar-yan.png",
          genderPresentation: "neutral",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "严老师画面预览" })).toBeDefined();
    expect(screen.queryByRole("img", { name: "林老师画面预览" })).toBeNull();
  });

  it("disables the script editor while the page is locked", () => {
    render(
      <SlideContentTabs
        slide={slide}
        displayText={slide.teachingScript}
        spokenText={slide.teachingScript}
        activeTab="script"
        onTabChange={vi.fn()}
        onDisplayTextChange={vi.fn()}
        onSpokenTextChange={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole("textbox", { name: /朗读文本/ }) as HTMLTextAreaElement).disabled,
    ).toBe(true);
  });

  it("keeps subtitle display text and spoken text independently editable", () => {
    const onDisplayTextChange = vi.fn();
    const onSpokenTextChange = vi.fn();
    render(
      <SlideContentTabs
        slide={{ ...slide, isLocked: false }}
        displayText="字幕断句"
        spokenText="公式的中文读法"
        activeTab="script"
        onTabChange={vi.fn()}
        onDisplayTextChange={onDisplayTextChange}
        onSpokenTextChange={onSpokenTextChange}
      />,
    );

    expect((screen.getByRole("textbox", { name: "字幕显示文本" }) as HTMLTextAreaElement).value).toBe("字幕断句");
    expect((screen.getByRole("textbox", { name: "朗读文本" }) as HTMLTextAreaElement).value).toBe("公式的中文读法");
    fireEvent.change(screen.getByRole("textbox", { name: "朗读文本" }), { target: { value: "修正后的公式读法" } });
    expect(onDisplayTextChange).not.toHaveBeenCalled();
    expect(onSpokenTextChange).toHaveBeenCalledWith("修正后的公式读法");
  });
});
