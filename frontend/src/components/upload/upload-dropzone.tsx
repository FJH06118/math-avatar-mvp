"use client";

import { UploadCloudIcon } from "lucide-react";
import { useDropzone, type FileRejection } from "react-dropzone";

import { Button } from "@/components/ui/button";
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
  const { getInputProps, getRootProps, isDragActive, open } = useDropzone({
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
          "group flex min-h-80 w-full flex-col items-center justify-center gap-5 rounded-lg border border-dashed border-foreground/25 bg-secondary/24 p-6 text-center outline-none transition-[color,background-color,border-color] duration-[180ms] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 sm:p-10",
          isDragActive
            ? "border-primary bg-primary/8"
            : "hover:border-primary/60 hover:bg-secondary/38",
          disabled && "cursor-not-allowed opacity-60",
        ),
        "aria-label": "选择或拖拽上传 PPT 文件",
        role: "presentation",
        tabIndex: -1,
      })}
    >
      <input {...getInputProps()} />
      <UploadCloudIcon
        aria-hidden="true"
        className="size-8 text-primary"
        strokeWidth={1.7}
      />
      <div className="flex max-w-lg flex-col gap-2">
        <p className="text-balance text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
          {isDragActive ? "松开即可添加课件" : "拖拽 PPT 到这里，或点击选择文件"}
        </p>
        <p className="text-base text-muted-foreground sm:text-sm">
          支持 .ppt 和 .pptx，单个文件最大 100 MB
        </p>
      </div>
      <Button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          open();
        }}
      >
        选择文件
      </Button>
      <p className="text-sm text-muted-foreground">
        文件仅用于当前课程制作
      </p>
    </div>
  );
}
