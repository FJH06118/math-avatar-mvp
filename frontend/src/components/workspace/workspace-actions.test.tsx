import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceActions } from "./workspace-actions";
import {
  planFailureMessage,
  planFailureNeedsProviderCheck,
  planIdempotencyKey,
} from "./plan-failure-guidance";

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

  it("uses bounded deterministic plan retry keys and safe actionable guidance", () => {
    const failedTaskId = `task_${"x".repeat(140)}`;
    const first = planIdempotencyKey("presentation_one", failedTaskId);
    const replay = planIdempotencyKey("presentation_one", failedTaskId);
    expect(first).toBe(replay);
    expect(first.length).toBeLessThanOrEqual(128);
    expect(planIdempotencyKey("presentation_one")).toBe("plan_initial_presentation_one");
    expect(planFailureNeedsProviderCheck("AGENT_CONNECTION_FAILED")).toBe(true);
    expect(planFailureMessage("AGENT_CONNECTION_FAILED")).toContain("重新测试连接");
    expect(planFailureMessage("AGENT_PROVIDER_FAILED", "Provider 服务连接失败。")).toContain("Provider 连接失败");
    expect(planFailureNeedsProviderCheck("AGENT_PROVIDER_FAILED", "Provider 服务连接失败。")).toBe(true);
    expect(planFailureMessage("AGENT_PROVIDER_FAILED", "课程规划服务暂时不可用。")).toContain("本地课程规划组件");
    expect(planFailureNeedsProviderCheck("AGENT_PROVIDER_FAILED", "课程规划服务暂时不可用。")).toBe(false);
    expect(planFailureNeedsProviderCheck("AGENT_RUNTIME_FAILED")).toBe(false);
    expect(planFailureMessage("UNEXPECTED_INTERNAL_PATH")).not.toContain("UNEXPECTED_INTERNAL_PATH");
    expect(planFailureMessage("AGENT_PROVIDER_FAILED", "C:\\secret\\stack.log")).not.toContain("stack.log");
  });
});
