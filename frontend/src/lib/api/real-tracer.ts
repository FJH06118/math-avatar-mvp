import {
  ApiErrorSchema,
  StableIdSchema,
  TracerTaskResponseSchema,
  TracerUploadMetadataSchema,
  TracerUploadResponseSchema,
  type Task,
  type TracerUploadReceipt,
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
