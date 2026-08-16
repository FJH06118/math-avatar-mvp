import { afterEach, describe, expect, it, vi } from "vitest";

import {
  archiveProject,
  copyProject,
  deleteProject,
  getProject,
  listProjects,
} from "./projects";

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

  it("uses the same filters and lifecycle operations in the mock adapter", async () => {
    vi.useFakeTimers();
    const copyRequest = copyProject("project-limit", {
      idempotencyKey: "copy-project-limit-test",
    });
    const copied = await resolveAfterDelay(copyRequest, 520);

    const archiveRequest = archiveProject(copied.id, copied.version);
    const archived = await resolveAfterDelay(archiveRequest, 420);
    expect(archived.status).toBe("archived");

    const listRequest = listProjects({ status: "archived", includeArchived: true });
    const listed = await resolveAfterDelay(listRequest, 650);
    expect(listed.map((project) => project.id)).toContain(copied.id);

    const deleteRequest = deleteProject(copied.id, archived.version);
    await resolveAfterDelay(deleteRequest, 480);
  });
});
