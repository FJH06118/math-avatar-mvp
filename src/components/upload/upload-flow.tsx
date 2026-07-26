"use client";

import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  FileIcon,
  RotateCcwIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ErrorState } from "@/components/feedback/error-state";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  createParsingJob,
  createProject,
  getUserFacingErrorMessage,
  uploadPresentation,
} from "@/lib/api";

import { UploadDropzone } from "./upload-dropzone";

interface UploadMutationInput {
  file: File;
  fail: boolean;
}

interface UploadMutationResult {
  projectId: string;
  jobId: string;
}

const compactDecimalFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function formatBytes(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;
  return `${compactDecimalFormatter.format(megabytes)} MB`;
}

function getProjectTitle(fileName: string): string {
  return fileName.replace(/\.pptx?$/i, "").replaceAll("_", " ");
}

export function UploadFlow() {
  const router = useRouter();
  const abortControllerRef = useRef<AbortController | null>(null);
  const demoFailureConsumedRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);

  const uploadMutation = useMutation<
    UploadMutationResult,
    Error,
    UploadMutationInput
  >({
    mutationFn: async ({ file, fail }) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const uploadedFile = await uploadPresentation({
        file,
        fail,
        signal: controller.signal,
        onProgress: setProgress,
      });
      const project = await createProject({
        title: getProjectTitle(file.name),
        uploadedFileId: uploadedFile.id,
        fileName: uploadedFile.name,
      });
      const job = await createParsingJob(project.id);
      return { projectId: project.id, jobId: job.id };
    },
    onSuccess: ({ projectId, jobId }) => {
      abortControllerRef.current = null;
      window.setTimeout(() => {
        router.push(`/projects/${projectId}/parsing?jobId=${jobId}`);
      }, 650);
    },
    onSettled: () => {
      abortControllerRef.current = null;
    },
  });

  const isUploading = uploadMutation.isPending;
  const isSuccess = uploadMutation.isSuccess;

  function handleFileAccepted(file: File) {
    setSelectedFile(file);
    setValidationError(null);
    setCancelledMessage(null);
    setProgress(0);
    demoFailureConsumedRef.current = false;
    uploadMutation.reset();
  }

  function handleFileRejected(message: string) {
    setSelectedFile(null);
    setValidationError(message);
    setCancelledMessage(null);
    setProgress(0);
    uploadMutation.reset();
  }

  function startUpload() {
    if (!selectedFile) {
      setValidationError("请先选择一个 PPT 或 PPTX 文件。");
      return;
    }
    setCancelledMessage(null);
    setProgress(0);
    const shouldFailForDemo =
      selectedFile.name.includes("失败") &&
      !demoFailureConsumedRef.current;
    if (shouldFailForDemo) {
      demoFailureConsumedRef.current = true;
    }
    uploadMutation.mutate({
      file: selectedFile,
      fail: shouldFailForDemo,
    });
  }

  function retryUpload() {
    uploadMutation.reset();
    window.setTimeout(startUpload, 0);
  }

  function cancelUpload() {
    abortControllerRef.current?.abort();
    setCancelledMessage("上传已取消，文件仍保留在此页，可随时重新上传。");
  }

  function clearFile() {
    setSelectedFile(null);
    setProgress(0);
    setValidationError(null);
    setCancelledMessage(null);
    uploadMutation.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      {!selectedFile ? (
        <UploadDropzone
          onFileAccepted={handleFileAccepted}
          onFileRejected={handleFileRejected}
        />
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-6">
          <Item variant="muted">
            <ItemMedia
              variant="icon"
              className="flex size-10 items-center justify-center rounded-lg bg-background text-primary"
            >
              <FileIcon aria-hidden="true" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{selectedFile.name}</ItemTitle>
              <ItemDescription>
                {formatBytes(selectedFile.size)} ·{" "}
                {selectedFile.name.toLowerCase().endsWith(".pptx")
                  ? "PowerPoint 演示文稿"
                  : "PowerPoint 97–2003 演示文稿"}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isUploading || isSuccess}
                aria-label={`移除文件：${selectedFile.name}`}
                onClick={clearFile}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </ItemActions>
          </Item>

          {isUploading || isSuccess ? (
            <Progress value={isSuccess ? 100 : progress}>
              <ProgressLabel>
                {isSuccess ? "上传完成，正在创建项目" : "正在上传课件"}
              </ProgressLabel>
              <ProgressValue />
            </Progress>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {isUploading ? (
              <Button type="button" variant="outline" onClick={cancelUpload}>
                取消上传
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={isUploading || isSuccess}
              onClick={startUpload}
            >
              {isUploading ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <UploadIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {isUploading
                ? `正在上传 ${progress}%`
                : isSuccess
                  ? "上传完成"
                  : "开始上传"}
            </Button>
          </div>
        </div>
      )}

      {validationError ? (
        <ErrorState title="无法添加文件" description={validationError} />
      ) : null}

      {cancelledMessage ? (
        <Alert>
          <AlertTitle>上传已取消</AlertTitle>
          <AlertDescription>{cancelledMessage}</AlertDescription>
        </Alert>
      ) : null}

      {uploadMutation.isError &&
      !(uploadMutation.error instanceof DOMException) ? (
        <ErrorState
          title="上传失败"
          description={getUserFacingErrorMessage(
            uploadMutation.error,
            "课件上传失败，请检查文件和连接后重试。",
          )}
          retryLabel="重新上传"
          onRetry={retryUpload}
          isRetrying={uploadMutation.isPending}
        />
      ) : null}

      {isSuccess ? (
        <Alert>
          <CheckCircle2Icon aria-hidden="true" />
          <AlertTitle>课件上传成功</AlertTitle>
          <AlertDescription>
            项目已创建，即将进入课件解析页面。
          </AlertDescription>
        </Alert>
      ) : null}

      {uploadMutation.isError &&
      !(uploadMutation.error instanceof DOMException) ? (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={retryUpload}
        >
          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
          使用同一文件重试
        </Button>
      ) : null}
    </div>
  );
}
