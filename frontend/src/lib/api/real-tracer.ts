import {
  ApiErrorSchema,
  StableIdSchema,
  TracerTaskResponseSchema,
  TracerUploadMetadataSchema,
  TracerUploadResponseSchema,
  LessonPlanRevisionEditRequestSchema,
  LessonPlanRevisionListResponseSchema,
  LessonPlanRevisionResponseSchema,
  PlanTaskCreateRequestSchema,
  PlanTaskResponseSchema,
  AudioTaskCreateRequestSchema,
  AudioTaskResponseSchema,
  AudioTimelineResponseSchema,
  RenderTaskCreateRequestSchema,
  RenderTaskResponseSchema,
  RenderedPageListResponseSchema,
  CompositeTaskCreateRequestSchema,
  CompositeTaskResponseSchema,
  FinalMediaResponseSchema,
  DeliveryManifestResponseSchema,
  ProjectCopyInputSchema,
  ProjectListQuerySchema,
  ProjectListResponseSchema,
  ProjectResponseSchema,
  ProjectVersionInputSchema,
  ParseSnapshotResponseSchema,
  WorkspaceLockInputSchema,
  WorkspaceLockResponseSchema,
  WorkspaceSnapshotResponseSchema,
  TeachingSettingsResponseSchema,
  TeachingSettingsUpdateInputSchema,
  RetryTaskRequestSchema,
  type LessonPlanRevision,
  type LessonPlanRevisionEditRequest,
  type PlanTaskCreateRequest,
  type Task,
  type TracerUploadReceipt,
  type AudioTaskCreateRequest,
  type AudioTimeline,
  type RenderTaskCreateRequest,
  type RenderedPage,
  type CompositeTaskCreateRequest,
  type FinalMedia,
  type DeliveryManifest,
  type Project,
  type ProjectCopyInput,
  type ProjectListQuery,
  type ParseSnapshot,
  type WorkspaceSnapshot,
  type TeachingSettings,
} from "@ppt-digital-human/contracts";

export class RealApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "RealApiError";
  }
}

export async function listRealProjects(
  input: Partial<ProjectListQuery> = {},
  signal?: AbortSignal,
): Promise<Project[]> {
  const query = ProjectListQuerySchema.parse(input);
  const search = new URLSearchParams();
  if (query.search) search.set("search", query.search);
  if (query.status) search.set("status", query.status);
  if (query.includeArchived) search.set("includeArchived", "true");
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await fetch(`/api/t/projects${suffix}`, { signal });
  const body: unknown = await response.json();
  if (!response.ok) throwPublicError(body);
  return ProjectListResponseSchema.parse(body).data;
}

export async function getRealProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<Project> {
  StableIdSchema.parse(projectId);
  const response = await fetch(`/api/t/projects/${encodeURIComponent(projectId)}`, {
    signal,
  });
  const body: unknown = await response.json();
  if (!response.ok) throwPublicError(body);
  return ProjectResponseSchema.parse(body).data;
}

export async function copyRealProject(
  projectId: string,
  input: ProjectCopyInput,
  signal?: AbortSignal,
): Promise<Project> {
  StableIdSchema.parse(projectId);
  const body = ProjectCopyInputSchema.parse(input);
  return mutateProject(
    `/api/t/projects/${encodeURIComponent(projectId)}/copy`,
    "POST",
    body,
    signal,
  );
}

export async function archiveRealProject(
  projectId: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<Project> {
  StableIdSchema.parse(projectId);
  const body = ProjectVersionInputSchema.parse({ expectedVersion });
  return mutateProject(
    `/api/t/projects/${encodeURIComponent(projectId)}/archive`,
    "POST",
    body,
    signal,
  );
}

export async function deleteRealProject(
  projectId: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<void> {
  StableIdSchema.parse(projectId);
  const body = ProjectVersionInputSchema.parse({ expectedVersion });
  const response = await fetch(`/api/t/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 204) return;
  const payload: unknown = await response.json();
  throwPublicError(payload);
}

export async function uploadTracerPresentation(input: {
  title: string;
  file: File;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<TracerUploadReceipt> {
  TracerUploadMetadataSchema.parse({
    title: input.title,
    fileName: input.file.name,
    mimeType: input.file.type,
    fileSize: input.file.size,
    idempotencyKey: input.idempotencyKey,
  });
  const form = new FormData();
  form.set("title", input.title);
  form.set("file", input.file);
  const response = await fetch("/api/t/projects", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: form,
    signal: input.signal,
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throwPublicError(body);
  }
  return TracerUploadResponseSchema.parse(body).data;
}

export async function getTracerTask(taskId: string, signal?: AbortSignal): Promise<Task> {
  StableIdSchema.parse(taskId);
  const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}`, { signal });
  const body: unknown = await response.json();
  if (!response.ok) {
    throwPublicError(body);
  }
  return TracerTaskResponseSchema.parse(body).data;
}

export async function retryTracerTask(
  taskId: string,
  input: { projectId: string; idempotencyKey: string },
  signal?: AbortSignal,
): Promise<Task> {
  StableIdSchema.parse(taskId);
  const body = RetryTaskRequestSchema.parse(input);
  const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}/retry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return TracerTaskResponseSchema.parse(payload).data;
}

export async function getTracerParseSnapshot(
  taskId: string,
  signal?: AbortSignal,
): Promise<ParseSnapshot> {
  StableIdSchema.parse(taskId);
  const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}/parsing`, {
    signal,
  });
  const body: unknown = await response.json();
  if (!response.ok) throwPublicError(body);
  return ParseSnapshotResponseSchema.parse(body).data;
}

export async function getTracerWorkspace(
  projectId: string,
  signal?: AbortSignal,
): Promise<WorkspaceSnapshot> {
  StableIdSchema.parse(projectId);
  const response = await fetch(
    `/api/t/projects/${encodeURIComponent(projectId)}/workspace`,
    { signal },
  );
  const body: unknown = await response.json();
  if (!response.ok) throwPublicError(body);
  return WorkspaceSnapshotResponseSchema.parse(body).data;
}

export async function setTracerRevisionLocked(
  revisionId: string,
  expectedRevision: number,
  locked: boolean,
  signal?: AbortSignal,
): Promise<boolean> {
  StableIdSchema.parse(revisionId);
  const body = WorkspaceLockInputSchema.parse({ expectedRevision, locked });
  const response = await fetch(
    `/api/t/revisions/${encodeURIComponent(revisionId)}/lock`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return WorkspaceLockResponseSchema.parse(payload).data.locked;
}

export async function updateRealTeachingSettings(
  projectId: string,
  expectedVersion: number,
  settings: TeachingSettings,
  signal?: AbortSignal,
): Promise<TeachingSettings> {
  StableIdSchema.parse(projectId);
  const body = TeachingSettingsUpdateInputSchema.parse({ expectedVersion, settings });
  const response = await fetch(
    `/api/t/projects/${encodeURIComponent(projectId)}/settings`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return TeachingSettingsResponseSchema.parse(payload).data;
}

export async function cancelTracerTask(taskId: string, signal?: AbortSignal): Promise<Task> {
  StableIdSchema.parse(taskId);
  const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
    signal,
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throwPublicError(body);
  }
  return TracerTaskResponseSchema.parse(body).data;
}

export async function createTracerPlanTask(
  projectId: string,
  input: PlanTaskCreateRequest,
  signal?: AbortSignal,
): Promise<Task> {
  StableIdSchema.parse(projectId);
  const body = PlanTaskCreateRequestSchema.parse(input);
  const response = await fetch(`/api/t/projects/${encodeURIComponent(projectId)}/plans`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return PlanTaskResponseSchema.parse(payload).data;
}

export async function getTracerLessonPlans(projectId: string, signal?: AbortSignal): Promise<LessonPlanRevision[]> {
  StableIdSchema.parse(projectId);
  const response = await fetch(`/api/t/projects/${encodeURIComponent(projectId)}/lesson-plans`, { signal });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return LessonPlanRevisionListResponseSchema.parse(payload).data;
}

export async function reviseTracerLessonPlan(
  revisionId: string,
  input: LessonPlanRevisionEditRequest,
  signal?: AbortSignal,
): Promise<LessonPlanRevision> {
  StableIdSchema.parse(revisionId);
  const body = LessonPlanRevisionEditRequestSchema.parse(input);
  return mutateRevision(`/api/t/revisions/${encodeURIComponent(revisionId)}/revise`, body, signal);
}

export async function approveTracerLessonPlan(
  revisionId: string,
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<LessonPlanRevision> {
  StableIdSchema.parse(revisionId);
  return mutateRevision(
    `/api/t/revisions/${encodeURIComponent(revisionId)}/approve`,
    { expectedRevision },
    signal,
  );
}

export async function createTracerAudioTask(
  projectId: string,
  input: AudioTaskCreateRequest,
  signal?: AbortSignal,
): Promise<Task> {
  StableIdSchema.parse(projectId);
  const body = AudioTaskCreateRequestSchema.parse(input);
  const response = await fetch(`/api/t/projects/${encodeURIComponent(projectId)}/audio`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return AudioTaskResponseSchema.parse(payload).data;
}

export async function createTracerVoicePreviewTask(
  projectId: string,
  input: AudioTaskCreateRequest,
  signal?: AbortSignal,
): Promise<Task> {
  StableIdSchema.parse(projectId);
  const body = AudioTaskCreateRequestSchema.parse(input);
  const response = await fetch(`/api/t/projects/${encodeURIComponent(projectId)}/voice-previews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return AudioTaskResponseSchema.parse(payload).data;
}

export async function getTracerAudioTimeline(taskId: string, signal?: AbortSignal): Promise<AudioTimeline> {
  StableIdSchema.parse(taskId);
  const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}/audio`, { signal });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return AudioTimelineResponseSchema.parse(payload).data;
}

export async function createTracerRenderTask(projectId: string, input: RenderTaskCreateRequest, signal?: AbortSignal): Promise<Task> {
  StableIdSchema.parse(projectId);
  const body = RenderTaskCreateRequestSchema.parse(input);
  const response = await fetch(`/api/t/projects/${encodeURIComponent(projectId)}/renders`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return RenderTaskResponseSchema.parse(payload).data;
}

export async function getTracerRenderedPages(taskId: string, signal?: AbortSignal): Promise<RenderedPage[]> {
  StableIdSchema.parse(taskId);
  const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}/pages`, { signal });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return RenderedPageListResponseSchema.parse(payload).data;
}

export async function createTracerCompositeTask(projectId: string, input: CompositeTaskCreateRequest, signal?: AbortSignal): Promise<Task> {
  StableIdSchema.parse(projectId); const body = CompositeTaskCreateRequestSchema.parse(input);
  const response = await fetch(`/api/t/projects/${encodeURIComponent(projectId)}/composites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  const payload: unknown = await response.json(); if (!response.ok) throwPublicError(payload);
  return CompositeTaskResponseSchema.parse(payload).data;
}

export async function getTracerFinalMedia(taskId: string, signal: AbortSignal | undefined, projectId: string): Promise<FinalMedia> {
  StableIdSchema.parse(taskId); StableIdSchema.parse(projectId); const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}/media?projectId=${encodeURIComponent(projectId)}`, { signal });
  const payload: unknown = await response.json(); if (!response.ok) throwPublicError(payload);
  return FinalMediaResponseSchema.parse(payload).data;
}

export async function getTracerDelivery(taskId: string, signal: AbortSignal | undefined, projectId: string): Promise<DeliveryManifest> {
  StableIdSchema.parse(taskId); StableIdSchema.parse(projectId); const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}/delivery?projectId=${encodeURIComponent(projectId)}`, { signal });
  const payload: unknown = await response.json(); if (!response.ok) throwPublicError(payload);
  return DeliveryManifestResponseSchema.parse(payload).data;
}

async function mutateRevision(path: string, body: unknown, signal?: AbortSignal): Promise<LessonPlanRevision> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return LessonPlanRevisionResponseSchema.parse(payload).data;
}

async function mutateProject(
  path: string,
  method: "POST",
  body: unknown,
  signal?: AbortSignal,
): Promise<Project> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throwPublicError(payload);
  return ProjectResponseSchema.parse(payload).data;
}

function throwPublicError(body: unknown): never {
  const parsed = ApiErrorSchema.safeParse(body);
  if (parsed.success) {
    throw new RealApiError(
      parsed.data.error.message,
      parsed.data.error.code,
      parsed.data.error.retryable,
    );
  }
  throw new RealApiError("服务返回了无法识别的响应。", "INVALID_API_RESPONSE", true);
}
