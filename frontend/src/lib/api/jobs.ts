import type { Job, MockRequestOptions } from "@/types";
import {
  JobSchema,
  ProjectIdSchema,
  TaskIdSchema,
  type Task,
  type WorkflowRun,
} from "@ppt-digital-human/contracts";

import {
  createMockJob,
  getMockJobRecord,
  mockDb,
  refreshMockJob,
  resetMockJob,
  toPublicJob,
} from "./mock-client";
import { requireRecord, simulateRequest } from "./shared";
import { getEnabledTracerApiAdapter } from "./tracer-adapter";
import { getRealProject, RealApiError } from "./real-tracer";
import {
  normalizeSupportedTeachingSettings,
} from "./teaching-settings";

export function realTaskToJob(task: Task): Job {
  const status = {
    CREATED: "queued",
    QUEUED: "queued",
    RUNNING: "running",
    SUCCEEDED: "completed",
    FAILED: "failed",
    CANCELLED: "cancelled",
  } as const;
  const jobStatus = status[task.status];
  const progress = Math.round((task.progressCompleted / task.progressTotal) * 100);
  const stageStatus =
    jobStatus === "completed"
      ? "completed"
      : jobStatus === "failed"
        ? "failed"
        : jobStatus === "running"
          ? "running"
          : "pending";
  const stage = {
    PARSE: { id: "parse_pages", label: "解析课件", description: "生成原页与结构化解析结果。" },
    PLAN: { id: "plan", label: "生成讲稿", description: "生成逐页讲稿与场景规划。" },
    AUDIO: { id: "audio", label: "合成语音与字幕", description: "逐句合成语音并生成真实字幕时间轴。" },
    PAGE_RENDER: { id: "page_render", label: "渲染逐页视频", description: "按原页、安全站位和音频渲染分页视频。" },
    COMPOSITE: { id: "composite", label: "合成完整视频", description: "拼接分页视频、音频与字幕。" },
    VALIDATE: { id: "validate", label: "验证交付媒体", description: "执行完整解码、覆盖、黑帧、声音和安全区硬门。" },
  }[task.stage];
  return JobSchema.parse({
    id: task.id,
    projectId: task.projectId,
    type: task.kind === "PARSE" ? "parsing" : "rendering",
    status: jobStatus,
    progress,
    currentStageId: stage.id,
    currentSlideId: task.currentSlideId,
    stages: [
      {
        id: stage.id,
        label: stage.label,
        description:
          jobStatus === "completed"
            ? `${stage.label}已完成。`
            : jobStatus === "failed"
              ? task.errorMessage ?? "服务端解析失败。"
              : `${stage.description} 服务端已完成 ${task.progressCompleted}/${task.progressTotal} 个工作单元。`,
        status: stageStatus,
        progress,
      },
    ],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    error: task.errorMessage,
    errorCode: task.errorCode,
    retryable: task.status === "FAILED" ? !NON_RETRYABLE_CODES.has(task.errorCode ?? "") : undefined,
  });
}

export function realWorkflowToJob(run: WorkflowRun): Job {
  const status = {
    QUEUED: "queued",
    RUNNING: "running",
    SUCCEEDED: "completed",
    FAILED: "failed",
    CANCELLED: "cancelled",
  } as const;
  const jobStatus = status[run.status];
  const stageOrder = ["PLAN", "AUDIO", "PAGE_RENDER", "COMPOSITE", "VALIDATE"] as const;
  const stageMeta = {
    PLAN: { id: "plan", label: "生成讲稿", description: "生成逐页讲稿与场景规划。" },
    AUDIO: { id: "audio", label: "合成语音与字幕", description: "逐句合成语音并生成真实字幕时间轴。" },
    PAGE_RENDER: { id: "page_render", label: "渲染逐页视频", description: "按原页、安全站位和音频渲染分页视频。" },
    COMPOSITE: { id: "composite", label: "合成完整视频", description: "拼接分页视频、音频与字幕。" },
    VALIDATE: { id: "validate", label: "验证交付媒体", description: "执行完整解码、覆盖、黑帧、声音和安全区硬门。" },
  } as const;
  const currentIndex = stageOrder.indexOf(run.currentStage);
  const stages = stageOrder.map((stage, index) => {
    const meta = stageMeta[stage];
    const isCurrent = stage === run.currentStage;
    const stageStatus = jobStatus === "completed"
      ? "completed"
      : jobStatus === "failed" && isCurrent
        ? "failed"
        : index < currentIndex
          ? "completed"
          : isCurrent && jobStatus === "running"
            ? "running"
            : "pending";
    return {
      id: meta.id,
      label: meta.label,
      description: isCurrent && run.errorMessage
        ? run.errorMessage
        : jobStatus === "completed" || index < currentIndex
          ? `${meta.label}已完成。`
          : `${meta.description} 服务端已完成 ${isCurrent ? `${run.progressCompleted}/${run.progressTotal}` : "0/0"} 个工作单元。`,
      status: stageStatus,
      progress: isCurrent
        ? Math.round((run.progressCompleted / run.progressTotal) * 100)
        : index < currentIndex || jobStatus === "completed"
          ? 100
          : 0,
    };
  });
  return JobSchema.parse({
    id: run.id,
    projectId: run.projectId,
    type: "rendering",
    status: jobStatus,
    progress: Math.round((run.progressCompleted / run.progressTotal) * 100),
    currentStageId: stageMeta[run.currentStage].id,
    currentSlideId: run.currentSlideId,
    finalTaskId: run.finalTaskId,
    stages,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    error: run.errorMessage,
    errorCode: run.errorCode,
    retryable: run.status === "FAILED" || run.status === "CANCELLED" ? true : undefined,
  });
}

export async function createParsingJob(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    const id = ProjectIdSchema.parse(projectId);
    const project = await getRealProject(id, options.signal);
    if (!project.parsingJobId) {
      throw new RealApiError(
        "项目没有可读取的解析任务，请重新上传课件。",
        "PARSE_TASK_NOT_FOUND",
        false,
      );
    }
    return realTaskToJob(await realAdapter.getTask(project.parsingJobId, options.signal));
  }
  await simulateRequest(options, 520);
  const id = ProjectIdSchema.parse(projectId);
  const project = requireRecord(mockDb.projects.get(id), "项目");
  const job = createMockJob(id, "parsing", options.fail);
  project.parsingJobId = job.id;
  project.status = "parsing";
  return job;
}

export async function createRenderJob(
  projectId: string,
  options: MockRequestOptions = {},
  retryToken?: string,
): Promise<Job> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    const [workspace, project] = await Promise.all([
      realAdapter.getWorkspace(ProjectIdSchema.parse(projectId), options.signal),
      getRealProject(ProjectIdSchema.parse(projectId), options.signal),
    ]);
    const firstSlide = workspace.slides[0];
    if (!firstSlide) throw new RealApiError("项目没有可生成的页面。", "WORKSPACE_EMPTY", false);
    const key = workflowKey("audio", projectId, [
      ...workspace.slides.map((slide) => `${slide.currentRevision?.id}:${slide.currentRevision?.revision}`),
      JSON.stringify(normalizeSupportedTeachingSettings(project.settings)),
      retryToken ?? "initial",
    ]);
    const workflow = await realAdapter.createWorkflow(projectId, {
      presentationId: firstSlide.parsed.presentationId,
      idempotencyKey: key,
    }, options.signal);
    return realWorkflowToJob(workflow);
  }
  await simulateRequest(options, 620);
  const id = ProjectIdSchema.parse(projectId);
  const project = requireRecord(mockDb.projects.get(id), "项目");
  const job = createMockJob(id, "rendering", options.fail);
  project.renderJobId = job.id;
  project.status = "rendering";
  return job;
}

export async function getWorkflowJob(
  workflowId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (!realAdapter) throw new RealApiError("真实渲染服务未启用。", "REAL_ADAPTER_DISABLED", false);
  return realWorkflowToJob(await realAdapter.getWorkflow(workflowId, options.signal));
}

export async function cancelWorkflowJob(
  workflowId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (!realAdapter) throw new RealApiError("真实渲染服务未启用。", "REAL_ADAPTER_DISABLED", false);
  return realWorkflowToJob(await realAdapter.cancelWorkflow(workflowId, options.signal));
}

export async function retryWorkflowJob(
  workflowId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (!realAdapter) throw new RealApiError("真实渲染服务未启用。", "REAL_ADAPTER_DISABLED", false);
  return realWorkflowToJob(await realAdapter.retryWorkflow(workflowId, {
    idempotencyKey: `workflow_retry_${crypto.randomUUID()}`,
  }, options.signal));
}

export async function getJob(
  jobId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    return realTaskToJob(
      await realAdapter.getTask(TaskIdSchema.parse(jobId), options.signal),
    );
  }
  await simulateRequest(options, 260);
  const id = TaskIdSchema.parse(jobId);
  const record = requireRecord(getMockJobRecord(id), "任务");
  return refreshMockJob(record);
}

export async function cancelJob(
  jobId: string,
  options: MockRequestOptions = {},
): Promise<Job> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    return realTaskToJob(
      await realAdapter.cancelTask(TaskIdSchema.parse(jobId), options.signal),
    );
  }
  await simulateRequest(options, 360);
  const id = TaskIdSchema.parse(jobId);
  const record = requireRecord(getMockJobRecord(id), "任务");
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
  context?: { projectId: string; audioTaskId?: string; renderTaskId?: string },
): Promise<Job> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    if (!context) throw new RealApiError("缺少任务恢复上下文。", "RETRY_CONTEXT_MISSING", false);
    const task = await realAdapter.getTask(TaskIdSchema.parse(jobId), options.signal);
    const projectId = ProjectIdSchema.parse(context.projectId);
    if (task.projectId !== projectId) {
      throw new RealApiError("任务不属于当前项目。", "TASK_PROJECT_MISMATCH", false);
    }
    return realTaskToJob(
      await realAdapter.retryTask(task.id, {
        projectId,
        idempotencyKey: `retry_${crypto.randomUUID()}`,
      }, options.signal),
    );
  }
  await simulateRequest(options, 420);
  const id = TaskIdSchema.parse(jobId);
  const record = requireRecord(getMockJobRecord(id), "任务");
  return resetMockJob(record);
}

function workflowKey(prefix: string, projectId: string, parts: string[]): string {
  let hash = 2166136261;
  for (const character of parts.join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${projectId}_${(hash >>> 0).toString(36)}`.slice(0, 128);
}

const NON_RETRYABLE_CODES = new Set([
  "AUDIO_SNAPSHOT_INVALID", "RENDER_SNAPSHOT_INVALID", "RENDER_ASSET_MISMATCH",
  "UNSUPPORTED_TASK", "MEDIA_TOOLS_MISSING", "OVERLAY_UNSUPPORTED",
]);
