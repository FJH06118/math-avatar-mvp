import type { UploadedFile, UploadPresentationInput } from "@/types";
import { FileNameSchema } from "@ppt-digital-human/contracts";

import { mockDb } from "./mock-client";
import { parseUploadedFile } from "./contracts";
import { MockApiError, delay } from "./shared";

const ALLOWED_EXTENSIONS = [".ppt", ".pptx"] as const;
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

export function getPresentationExtension(
  fileName: string,
): ".ppt" | ".pptx" | null {
  const normalized = fileName.toLowerCase();
  return (
    ALLOWED_EXTENSIONS.find((extension) =>
      normalized.endsWith(extension),
    ) ?? null
  );
}

export function validatePresentationFile(file: File): string | null {
  if (!FileNameSchema.safeParse(file.name).success) {
    return "文件名不合法。";
  }
  if (!getPresentationExtension(file.name)) {
    return "仅支持 .ppt 和 .pptx 文件。";
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return "文件不能超过 100 MB。";
  }
  return null;
}

export async function uploadPresentation({
  file,
  onProgress,
  signal,
  fail,
}: UploadPresentationInput): Promise<UploadedFile> {
  const validationError = validatePresentationFile(file);
  if (validationError) {
    throw new MockApiError(validationError, "INVALID_FILE");
  }

  const extension = getPresentationExtension(file.name);
  if (!extension) {
    throw new MockApiError("文件格式不受支持。", "INVALID_FILE");
  }

  const upload: UploadedFile = parseUploadedFile({
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    extension,
    mimeType: file.type || "application/vnd.ms-powerpoint",
    status: "uploading",
    progress: 0,
  });
  mockDb.uploads.set(upload.id, upload);

  try {
    for (let progress = 8; progress <= 100; progress += 8) {
      await delay(140, signal);
      upload.progress = Math.min(progress, 100);
      onProgress?.(upload.progress);
      if (fail && upload.progress >= 48) {
        upload.status = "failed";
        throw new MockApiError("上传连接中断，请重试。", "UPLOAD_FAILED");
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      upload.status = "cancelled";
    }
    throw error;
  }

  upload.status = "completed";
  upload.uploadedAt = new Date().toISOString();
  return parseUploadedFile(structuredClone(upload));
}
