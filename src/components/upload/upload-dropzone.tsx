"use client";

import { UploadCloudIcon } from "lucide-react";
import { useDropzone, type FileRejection } from "react-dropzone";

import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  disabled?: boolean;
  onFileAccepted: (file: File) => void;
  onFileRejected: (message: string) => void;
}

function getRejectionMessage(rejections: FileRejection[]): string {
  const firstError = rejections[0]?.errors[0];
  if (firstError?.code === "file-too-large") {
    return "文件超过 100 MB，请压缩课件后重试。";
  }
  return "文件格式不正确，仅支持 .ppt 和 .pptx。";
}

export function UploadDropzone({
  disabled = false,
  onFileAccepted,
  onFileRejected,
}: UploadDropzoneProps) {
  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept: {
      "application/vnd.ms-powerpoint": [".ppt"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        [".pptx"],
    },
    maxSize: 100 * 1024 * 1024,
    multiple: false,
    disabled,
    onDropAccepted: ([file]) => {
      if (file) {
        onFileAccepted(file);
      }
    },
    onDropRejected: (rejections) =>
      onFileRejected(getRejectionMessage(rejections)),
  });

  return (
    <div
      {...getRootProps({
        className: cn(
          "flex min-h-72 w-full flex-col items-center justify-center gap-5 rounded-2xl border border-dashed bg-card p-8 text-center outline-none transition-colors duration-200",
          isDragActive
            ? "border-primary bg-primary/5"
            : "hover:border-primary/50 hover:bg-muted/40",
          disabled && "cursor-not-allowed opacity-60",
        ),
        "aria-label": "选择或拖拽上传 PPT 文件",
      })}
    >
      <input {...getInputProps()} />
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <UploadCloudIcon aria-hidden="true" className="size-6" />
      </div>
      <div className="flex max-w-lg flex-col gap-2">
        <p className="text-base font-semibold">
          {isDragActive ? "松开即可添加课件" : "拖拽 PPT 到这里，或点击选择文件"}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          支持 .ppt 和 .pptx，单个文件最大 100 MB
        </p>
      </div>
      <span className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
        选择文件
      </span>
    </div>
  );
}
