import {
  PresentationSchema,
  ProjectSchema,
  TeachingSettingsSchema,
  TaskSchema,
  type Presentation,
  type Project,
  type Task,
} from "@ppt-digital-human/contracts";
import type { UploadAggregate } from "./repository.ts";
import type { ProjectRecord } from "./repository.ts";
import type { GenerationTask } from "../generated/prisma/client.ts";

const DEFAULT_SETTINGS = {
  avatarId: "avatar-lin",
  voiceId: "voice-qinghe",
  speechRate: 1,
  captionsEnabled: true,
  captionStyle: "clear",
  avatarPosition: "right",
  background: "light",
} as const;

export function projectUploadAggregate(aggregate: UploadAggregate): {
  project: Project;
  presentation: Presentation;
  task: Task;
} {
  const { project, presentation } = aggregate;
  return {
    project: ProjectSchema.parse({
      id: project.id,
      title: project.title,
      status: "parsing",
      fileName: presentation.originalFileName,
      slideCount: presentation.slideCount,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      uploadedFileId: presentation.sourceAssetId,
      parsingJobId: aggregate.id,
      settings: DEFAULT_SETTINGS,
      version: project.version,
    }),
    presentation: PresentationSchema.parse({
      id: presentation.id,
      projectId: presentation.projectId,
      sourceAssetId: presentation.sourceAssetId,
      originalFileName: presentation.originalFileName,
      sha256: presentation.sha256,
      fileSize: presentation.fileSize,
      mimeType: presentation.mimeType,
      slideCount: presentation.slideCount,
      width: presentation.width ?? undefined,
      height: presentation.height ?? undefined,
      aspectRatio: presentation.aspectRatio ?? undefined,
      parseStatus: presentation.parseStatus.toLowerCase(),
      parserVersion: presentation.parserVersion,
      revision: presentation.revision,
      createdAt: presentation.createdAt.toISOString(),
      updatedAt: presentation.updatedAt.toISOString(),
    }),
    task: projectTask(aggregate),
  };
}

export function projectRecord(record: ProjectRecord): Project {
  const presentation = record.presentations[0];
  const latestTask = record.tasks[0];
  const publicStatus = (() => {
    if (record.status === "ARCHIVED") return "archived";
    if (record.status === "FAILED") return "failed";
    if (record.status === "PARSING") return "parsing";
    if (record.status === "DRAFT") return "draft";
    if (
      latestTask?.kind === "VALIDATE" &&
      latestTask.status === "SUCCEEDED"
    ) {
      return "completed";
    }
    if (
      latestTask &&
      ["AUDIO", "PAGE_RENDER", "COMPOSITE", "VALIDATE"].includes(
        latestTask.kind,
      ) &&
      ["CREATED", "QUEUED", "RUNNING"].includes(latestTask.status)
    ) {
      return "rendering";
    }
    return "ready";
  })();

  const parsedSettings = TeachingSettingsSchema.safeParse(record.settings);
  return ProjectSchema.parse({
    id: record.id,
    title: record.title,
    status: publicStatus,
    fileName: presentation?.originalFileName ?? "未上传课件.pptx",
    slideCount: presentation?.slideCount ?? 0,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    uploadedFileId: presentation?.sourceAssetId,
    parsingJobId:
      latestTask?.kind === "PARSE" ? latestTask.id : undefined,
    planTaskId: latestTask?.kind === "PLAN" ? latestTask.id : undefined,
    renderJobId:
      latestTask &&
      ["PAGE_RENDER", "COMPOSITE", "VALIDATE"].includes(latestTask.kind)
        ? latestTask.id
        : undefined,
    settings: parsedSettings.success ? parsedSettings.data : DEFAULT_SETTINGS,
    version: record.version,
  });
}

export function projectTask(task: GenerationTask & { steps?: Array<{ slideId: string | null }> }): Task {
  return TaskSchema.parse({
    id: task.id,
    projectId: task.projectId,
    presentationId: task.presentationId,
    kind: task.kind,
    status: task.status,
    stage: task.stage,
    progressCompleted: task.progressCompleted,
    progressTotal: task.progressTotal,
    currentSlideId: task.steps?.[0]?.slideId ?? undefined,
    idempotencyKey: task.idempotencyKey,
    inputHash: task.inputHash,
    configHash: task.configHash,
    presentationRevision: task.presentationRevision,
    errorCode: task.errorCode ?? undefined,
    errorMessage: task.errorMessage ?? undefined,
    retryCount: task.retryCount,
    cancellationRequestedAt: task.cancellationRequestedAt?.toISOString(),
    heartbeatAt: task.heartbeatAt?.toISOString(),
    leaseExpiresAt: task.leaseExpiresAt?.toISOString(),
    statusVersion: task.statusVersion,
    startedAt: task.startedAt?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  });
}
