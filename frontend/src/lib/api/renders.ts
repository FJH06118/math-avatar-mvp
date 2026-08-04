import type { MockRequestOptions, RenderResult } from "@/types";
import { ProjectIdSchema } from "@ppt-digital-human/contracts";

import {
  demoRenderAssets,
  getMockJobRecord,
  mockDb,
  refreshMockJob,
} from "./mock-client";
import { parseRenderResult } from "./contracts";
import { MockApiError, requireRecord, simulateRequest } from "./shared";
import { getEnabledTracerApiAdapter } from "./tracer-adapter";
import { getRealProject } from "./real-tracer";

export async function getRenderResult(
  projectId: string,
  options: MockRequestOptions = {},
  taskId?: string,
): Promise<RenderResult> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    const id = ProjectIdSchema.parse(projectId);
    const project = await getRealProject(id, options.signal);
    const finalTaskId = taskId ?? project.renderJobId;
    if (!finalTaskId) throw new MockApiError("尚未找到已完成的媒体验证任务。", "RESULT_NOT_READY");
    const [media, delivery, task] = await Promise.all([
      realAdapter.getFinalMedia(finalTaskId, options.signal),
      realAdapter.getDelivery(finalTaskId, options.signal),
      realAdapter.getTask(finalTaskId, options.signal),
    ]);
    const video = delivery.files.find((file) => file.kind === "video");
    const captions = delivery.files.find((file) => file.kind === "captions");
    if (!video || !captions) throw new MockApiError("交付清单不完整。", "DELIVERY_INCOMPLETE");
    return parseRenderResult({
      id: `result_${finalTaskId}`,
      projectId: id,
      jobId: finalTaskId,
      title: delivery.metadata.title,
      videoUrl: video.downloadUrl,
      captionTrackUrl: `/api/t/tasks/${encodeURIComponent(finalTaskId)}/captions.vtt`,
      mp4Url: video.downloadUrl,
      srtUrl: captions.downloadUrl,
      durationSeconds: Math.round(media.totalDurationMs / 1_000),
      fileSizeBytes: video.fileSize,
      resolution: "1920 × 1080",
      generatedAt: task.completedAt ?? task.updatedAt,
      assetsAvailable: true,
      validation: media.validation,
    });
  }
  await simulateRequest(options, 620);
  const id = ProjectIdSchema.parse(projectId);
  const project = requireRecord(mockDb.projects.get(id), "项目");
  const existing = mockDb.renders.get(id);
  if (existing) {
    return parseRenderResult(structuredClone(existing));
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
  const result: RenderResult = parseRenderResult({
    id: crypto.randomUUID(),
    projectId: id,
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
    assetsAvailable: false,
  });
  mockDb.renders.set(id, result);
  return parseRenderResult(structuredClone(result));
}

export async function prepareRenderDownload(
  projectId: string,
  asset: "mp4" | "srt" | "metadata",
  options: MockRequestOptions = {},
  taskId?: string,
): Promise<string> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    ProjectIdSchema.parse(projectId);
    if (!taskId) throw new MockApiError("缺少最终媒体任务。", "RESULT_NOT_READY");
    const manifest = await realAdapter.getDelivery(taskId, options.signal);
    const kind = asset === "mp4" ? "video" : asset === "srt" ? "captions" : "metadata";
    const file = manifest.files.find((item) => item.kind === kind);
    if (!file) throw new MockApiError("下载文件暂不可用。", "ASSET_UNAVAILABLE");
    return file.downloadUrl;
  }
  const result = await getRenderResult(projectId, options, taskId);
  if (asset === "metadata") throw new MockApiError("演示数据不提供元数据文件。", "ASSET_UNAVAILABLE");
  const url = asset === "mp4" ? result.mp4Url : result.srtUrl;
  if (!result.assetsAvailable || !url) {
    throw new MockApiError("文件暂不可用，请稍后重试。", "ASSET_UNAVAILABLE");
  }
  return url;
}
