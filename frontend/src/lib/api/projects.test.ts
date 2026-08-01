import { afterEach, describe, expect, it, vi } from "vitest";

import { getProject } from "./projects";

async function resolveAfterDelay<T>(request: Promise<T>, delayMs: number) {
  await vi.advanceTimersByTimeAsync(delayMs);
  return request;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("projects API adapter", () => {
  it("returns a detached project snapshot", async () => {
    vi.useFakeTimers();

    const project = await resolveAfterDelay(getProject("project-limit"), 420);
    project.title = "不会写回 Mock 数据";

    const refetchedProject = await resolveAfterDelay(
      getProject("project-limit"),
      420,
    );

    expect(refetchedProject).toMatchObject({
      id: "project-limit",
      title: "函数极限与连续性",
      status: "ready",
    });
  });
});
