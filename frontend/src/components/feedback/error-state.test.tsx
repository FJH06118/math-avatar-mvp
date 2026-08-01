import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("exposes an actionable retry control", () => {
    const onRetry = vi.fn();

    render(
      <ErrorState
        title="无法加载项目"
        description="请稍后重试。"
        retryLabel="再次尝试"
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "再次尝试" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables retry while a request is in progress", () => {
    render(<ErrorState onRetry={vi.fn()} isRetrying />);

    expect(
      screen.getByRole("button", { name: "重试中…" }).getAttribute("disabled"),
    ).not.toBeNull();
  });
});
