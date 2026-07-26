"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CaptionsIcon,
  ClapperboardIcon,
  DownloadIcon,
  FileVideoIcon,
  RefreshCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  createRenderJob,
  getRenderResult,
  getUserFacingErrorMessage,
  prepareRenderDownload,
} from "@/lib/api";
import { cn } from "@/lib/utils";

import { ResultSkeleton } from "./result-skeleton";

interface ResultPageProps {
  projectId: string;
}

type DownloadAsset = "mp4" | "srt";
type VideoStatus = "loading" | "ready" | "error";

const integerFormatter = new Intl.NumberFormat("zh-CN");
const decimalFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${integerFormatter.format(minutes)} 分 ${integerFormatter
    .format(seconds)
    .padStart(2, "0")} 秒`;
}

function formatFileSize(bytes: number): string {
  return `${decimalFormatter.format(bytes / 1_000_000)} MB`;
}

export function ResultPage({ projectId }: ResultPageProps) {
  const router = useRouter();
  const [videoStatus, setVideoStatus] = useState<VideoStatus>("loading");
  const [videoKey, setVideoKey] = useState(0);

  const resultQuery = useQuery({
    queryKey: ["render-results", projectId],
    queryFn: () => getRenderResult(projectId),
  });

  const downloadMutation = useMutation({
    mutationFn: async (asset: DownloadAsset) => ({
      asset,
      url: await prepareRenderDownload(projectId, asset),
    }),
    onSuccess: ({ asset, url }) => {
      const link = document.createElement("a");
      link.href = url;
      link.download =
        asset === "mp4" ? "数字人授课视频.mp4" : "数字人授课字幕.srt";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => createRenderJob(projectId),
    onSuccess: (job) =>
      router.push(`/projects/${projectId}/generating?jobId=${job.id}`),
  });

  if (resultQuery.isPending) {
    return <ResultSkeleton />;
  }

  if (resultQuery.isError) {
    return (
      <PageContainer className="flex flex-col gap-4 py-10 sm:py-14">
        <ErrorState
          title="视频结果暂不可用"
          description={getUserFacingErrorMessage(
            resultQuery.error,
            "视频结果尚未准备好，请返回生成页查看任务进度。",
          )}
          retryLabel="重新加载"
          onRetry={() => resultQuery.refetch()}
          isRetrying={resultQuery.isFetching}
        />
        <div>
          <Link
            href={`/projects/${projectId}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            返回项目工作台
          </Link>
        </div>
      </PageContainer>
    );
  }

  const result = resultQuery.data;
  const downloadUnavailable =
    !result.assetsAvailable || !result.mp4Url || !result.srtUrl;

  function retryVideoLoad() {
    setVideoStatus("loading");
    setVideoKey((current) => current + 1);
  }

  return (
    <PageContainer className="flex flex-col gap-8 py-10 sm:py-14">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="flex max-w-3xl flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-primary">第 5 步，共 5 步</p>
            <Badge variant="secondary">生成成功</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
            授课视频已生成
          </h1>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            {result.title} 已完成数字人、语音与字幕合成，可以预览或下载。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${projectId}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            返回编辑
          </Link>
          <ConfirmDialog
            title="重新生成授课视频？"
            description="系统将使用当前已保存的讲稿和授课配置创建新任务。现有视频仍可在本次会话中查看。"
            confirmLabel="重新生成"
            disabled={regenerateMutation.isPending}
            onConfirm={() => regenerateMutation.mutate()}
            trigger={
              <Button
                type="button"
                variant="outline"
                disabled={regenerateMutation.isPending}
              >
                {regenerateMutation.isPending ? (
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                ) : (
                  <RefreshCwIcon
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                )}
                {regenerateMutation.isPending ? "正在创建任务…" : "重新生成"}
              </Button>
            }
          />
        </div>
      </header>

      {regenerateMutation.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>无法重新生成</AlertTitle>
          <AlertDescription>
            {getUserFacingErrorMessage(
              regenerateMutation.error,
              "暂时无法创建新的生成任务，请稍后重试。",
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <section
          className="min-w-0 overflow-hidden rounded-2xl border bg-card"
          aria-labelledby="video-preview-title"
        >
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <h2 id="video-preview-title" className="text-base font-semibold">
              视频预览
            </h2>
            <Badge variant="outline">{result.resolution}</Badge>
          </div>
          <div className="bg-foreground/95">
            {result.videoUrl ? (
              <video
                key={videoKey}
                className="aspect-video w-full"
                controls
                preload="metadata"
                poster={result.posterUrl}
                aria-describedby="video-load-status"
                onLoadedMetadata={() => setVideoStatus("ready")}
                onError={() => setVideoStatus("error")}
              >
                <source src={result.videoUrl} type="video/mp4" />
                {result.captionTrackUrl ? (
                  <track
                    kind="captions"
                    src={result.captionTrackUrl}
                    srcLang="zh-CN"
                    label="中文字幕"
                    default
                  />
                ) : null}
                当前浏览器不支持视频播放，请下载 MP4 后观看。
              </video>
            ) : (
              <div className="flex aspect-video items-center justify-center p-6 text-center text-primary-foreground">
                视频文件暂不可用，请稍后重新加载。
              </div>
            )}
          </div>
          <div
            id="video-load-status"
            className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
            aria-live="polite"
          >
            <p className="text-sm text-muted-foreground">
              {videoStatus === "loading"
                ? "正在加载视频封面与播放信息…"
                : videoStatus === "error"
                  ? "视频加载失败，可以重试或下载 MP4。"
                  : "视频已就绪，可直接播放并开启中文字幕。"}
            </p>
            {videoStatus === "loading" ? (
              <Spinner aria-hidden="true" />
            ) : videoStatus === "error" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={retryVideoLoad}
              >
                <RefreshCwIcon
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                重试播放
              </Button>
            ) : null}
          </div>
        </section>

        <aside className="flex flex-col gap-5 rounded-2xl border bg-card p-5">
          <div>
            <h2 className="text-base font-semibold">视频信息</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              最终合成文件与字幕资源
            </p>
          </div>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">视频时长</dt>
              <dd className="font-medium tabular-nums">
                {formatDuration(result.durationSeconds)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">文件大小</dt>
              <dd className="font-medium tabular-nums">
                {formatFileSize(result.fileSizeBytes)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">分辨率</dt>
              <dd className="font-medium tabular-nums">
                {result.resolution}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">生成时间</dt>
              <dd className="text-right font-medium">
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(result.generatedAt))}
              </dd>
            </div>
          </dl>

          <Separator />

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              disabled={
                downloadUnavailable || downloadMutation.isPending
              }
              onClick={() => downloadMutation.mutate("mp4")}
            >
              {downloadMutation.isPending &&
              downloadMutation.variables === "mp4" ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <FileVideoIcon
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              )}
              {downloadMutation.isPending &&
              downloadMutation.variables === "mp4"
                ? "正在准备 MP4…"
                : "下载 MP4"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                downloadUnavailable || downloadMutation.isPending
              }
              onClick={() => downloadMutation.mutate("srt")}
            >
              {downloadMutation.isPending &&
              downloadMutation.variables === "srt" ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <CaptionsIcon
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              )}
              {downloadMutation.isPending &&
              downloadMutation.variables === "srt"
                ? "正在准备字幕…"
                : "下载 SRT 字幕"}
            </Button>
          </div>

          {downloadUnavailable ? (
            <p className="text-sm text-muted-foreground">
              下载文件暂不可用，请稍后重新加载结果页。
            </p>
          ) : null}
        </aside>
      </div>

      {downloadMutation.isError ? (
        <Alert variant="destructive" role="alert">
          <DownloadIcon aria-hidden="true" />
          <AlertTitle>下载失败</AlertTitle>
          <AlertDescription>
            {getUserFacingErrorMessage(
              downloadMutation.error,
              "文件准备失败，请稍后重试。",
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ClapperboardIcon aria-hidden="true" className="size-4" />
        Mock 演示视频仅用于验证播放器和下载流程。
      </div>
    </PageContainer>
  );
}
