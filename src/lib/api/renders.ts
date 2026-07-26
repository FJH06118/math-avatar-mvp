import type { MockRequestOptions, RenderResult } from "@/types";

import {
  demoRenderAssets,
  getMockJobRecord,
  mockDb,
  refreshMockJob,
} from "./mock-client";
import { MockApiError, requireRecord, simulateRequest } from "./shared";

export async function getRenderResult(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<RenderResult> {
  await simulateRequest(options, 620);
  const project = requireRecord(mockDb.projects.get(projectId), "项目");
  const existing = mockDb.renders.get(projectId);
  if (existing) {
    return structuredClone(existing);
  }
  if (!project.renderJobId) {
    throw new MockApiError("尚未创建视频生成任务。", "RESULT_NOT_READY");
  }
  const jobRecord = requireRecord(
    getMockJobRecord(project.renderJobId),
    "视频生成任务",
  );
  const job = refreshMockJob(jobRecord);
  if (job.status !== "completed") {
    throw new MockApiError("视频仍在生成中，请稍后重试。", "RESULT_NOT_READY");
  }

  const timestamp = new Date().toISOString();
  const result: RenderResult = {
    id: crypto.randomUUID(),
    projectId,
    jobId: job.id,
    title: project.title,
    videoUrl: demoRenderAssets.videoUrl,
    posterUrl: demoRenderAssets.posterUrl,
    captionTrackUrl: demoRenderAssets.captionTrackUrl,
    mp4Url: demoRenderAssets.videoUrl,
    srtUrl: demoRenderAssets.srtUrl,
    durationSeconds: 312,
    fileSizeBytes: 86_400_000,
    resolution: "1920 × 1080",
    generatedAt: timestamp,
    assetsAvailable: true,
  };
  mockDb.renders.set(projectId, result);
  return structuredClone(result);
}

export async function prepareRenderDownload(
  projectId: string,
  asset: "mp4" | "srt",
  options: MockRequestOptions = {},
): Promise<string> {
  const result = await getRenderResult(projectId, options);
  const url = asset === "mp4" ? result.mp4Url : result.srtUrl;
  if (!result.assetsAvailable || !url) {
    throw new MockApiError("文件暂不可用，请稍后重试。", "ASSET_UNAVAILABLE");
  }
  return url;
}
