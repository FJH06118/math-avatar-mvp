import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceActions } from "./workspace-actions";

describe("WorkspaceActions", () => {
  it("saves immediately but requires confirmation before creating a video task", async () => {
    const onSave = vi.fn();
    const onGenerate = vi.fn();

    render(
      <WorkspaceActions
        canGenerate
        canSaveScripts
        isGenerating={false}
        onGenerate={onGenerate}
        onSave={onSave}
        saveState="saved"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存讲稿" }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "生成授课视频" }));
    expect(onGenerate).not.toHaveBeenCalled();

    fireEvent.click(
      await screen.findByRole("button", { name: "开始生成" }),
    );
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});
