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

export async function getTracerFinalMedia(taskId: string, signal?: AbortSignal): Promise<FinalMedia> {
  StableIdSchema.parse(taskId); const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}/media`, { signal });
  const payload: unknown = await response.json(); if (!response.ok) throwPublicError(payload);
  return FinalMediaResponseSchema.parse(payload).data;
}

export async function getTracerDelivery(taskId: string, signal?: AbortSignal): Promise<DeliveryManifest> {
  StableIdSchema.parse(taskId); const response = await fetch(`/api/t/tasks/${encodeURIComponent(taskId)}/delivery`, { signal });
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
