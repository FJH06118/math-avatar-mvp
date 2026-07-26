import type { Job, MockRequestOptions } from "@/types";

import {
  createMockJob,
  getMockJobRecord,
  mockDb,
  refreshMockJob,
  resetMockJob,
  toPublicJob,
} from "./mock-client";
import { requireRecord, simulateRequest } from "./shared";

export async function createParsingJob(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  await simulateRequest(options, 520);
  const project = requireRecord(mockDb.projects.get(projectId), "项目");
  const job = createMockJob(projectId, "parsing", options.fail);
  project.parsingJobId = job.id;
  project.status = "parsing";
  return job;
}

export async function createRenderJob(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  await simulateRequest(options, 620);
  const project = requireRecord(mockDb.projects.get(projectId), "项目");
  const job = createMockJob(projectId, "rendering", options.fail);
  project.renderJobId = job.id;
  project.status = "rendering";
  return job;
}

export async function getJob(
  jobId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  await simulateRequest(options, 260);
  const record = requireRecord(getMockJobRecord(jobId), "任务");
  return refreshMockJob(record);
}

export async function cancelJob(
  jobId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  await simulateRequest(options, 360);
  const record = requireRecord(getMockJobRecord(jobId), "任务");
  record.status = "cancelled";
  record.updatedAt = new Date().toISOString();
  const project = mockDb.projects.get(record.projectId);
  if (project) {
    project.status = "draft";
    project.updatedAt = record.updatedAt;
  }
  return toPublicJob(record);
}

export async function retryJob(
  jobId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  await simulateRequest(options, 420);
  const record = requireRecord(getMockJobRecord(jobId), "任务");
  return resetMockJob(record);
}
