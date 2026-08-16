import { describe, expect, it } from "vitest";
import type { Task, WorkflowRun } from "@ppt-digital-human/contracts";

import { realTaskToJob, realWorkflowToJob } from "./jobs";

const now = "2026-08-04T00:00:00.000Z";

describe("stage 5 real parse task projection", () => {
  it("uses server work units and exposes exactly one real parse stage", () => {
    const task: Task = {
      id: "task_stage5",
      projectId: "project_stage5",
      presentationId: "presentation_stage5",
      kind: "PARSE",
      status: "RUNNING",
      stage: "PARSE",
      progressCompleted: 2,
      progressTotal: 5,
      idempotencyKey: "upload_stage5",
      inputHash: "a".repeat(64),
      configHash: "b".repeat(64),
      presentationRevision: 1,
      retryCount: 0,
      statusVersion: 2,
      createdAt: now,
      updatedAt: now,
    };

    const job = realTaskToJob(task);

    expect(job.progress).toBe(40);
    expect(job.stages).toHaveLength(1);
    expect(job.stages[0]).toMatchObject({
      id: "parse_pages",
      status: "running",
      progress: 40,
    });
  });

  it("projects the real generation stage, current slide, error code, and retryability", () => {
    const job = realTaskToJob({
      id: "task_stage8", projectId: "project_stage8", presentationId: "presentation_stage8",
      kind: "GENERATE", status: "FAILED", stage: "PAGE_RENDER", progressCompleted: 2, progressTotal: 3,
      currentSlideId: "slide_stage8_3", idempotencyKey: "render_stage8", inputHash: "a".repeat(64),
      configHash: "b".repeat(64), presentationRevision: 1, errorCode: "FFMPEG_TRANSIENT",
      errorMessage: "渲染进程暂时失败。", retryCount: 1, statusVersion: 4, createdAt: now, updatedAt: now,
    });
    expect(job).toMatchObject({
      currentStageId: "page_render", currentSlideId: "slide_stage8_3",
      errorCode: "FFMPEG_TRANSIENT", retryable: true,
    });
  });

  it("projects one server-owned workflow with its final media task", () => {
    const run: WorkflowRun = {
      id: "workflow_stage8",
      projectId: "project_stage8",
      presentationId: "presentation_stage8",
      status: "SUCCEEDED",
      currentStage: "VALIDATE",
      progressCompleted: 2,
      progressTotal: 2,
      audioTaskId: "task_audio_stage8",
      renderTaskId: "task_render_stage8",
      compositeTaskId: "task_media_stage8",
      finalTaskId: "task_media_stage8",
      retryCount: 0,
      statusVersion: 8,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const job = realWorkflowToJob(run);

    expect(job).toMatchObject({
      id: "workflow_stage8",
      status: "completed",
      currentStageId: "validate",
      finalTaskId: "task_media_stage8",
      progress: 100,
    });
    expect(job.stages.every((stage) => stage.status === "completed")).toBe(true);
  });
});
