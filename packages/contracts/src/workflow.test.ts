import { describe, expect, it } from "vitest";

import { WorkflowRunSchema } from "./workflow";

const base = {
  id: "workflow_contract_1",
  projectId: "project_contract_1",
  presentationId: "presentation_contract_1",
  status: "RUNNING" as const,
  currentStage: "AUDIO" as const,
  progressCompleted: 1,
  progressTotal: 2,
  audioTaskId: "task_audio_contract_1",
  retryCount: 0,
  statusVersion: 2,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:01.000Z",
};

describe("WorkflowRunSchema", () => {
  it("accepts an in-progress public projection", () => {
    expect(WorkflowRunSchema.parse(base).currentStage).toBe("AUDIO");
  });

  it("requires the final task on successful completion", () => {
    expect(WorkflowRunSchema.safeParse({ ...base, status: "SUCCEEDED", completedAt: base.updatedAt }).success).toBe(false);
    expect(WorkflowRunSchema.safeParse({
      ...base,
      status: "SUCCEEDED",
      completedAt: base.updatedAt,
      finalTaskId: "task_media_contract_1",
      progressCompleted: 2,
      progressTotal: 2,
    }).success).toBe(true);
  });
});
