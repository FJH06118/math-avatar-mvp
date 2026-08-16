"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CaptionsIcon,
  DownloadIcon,
  FileVideoIcon,
  RefreshCwIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { WorkflowFrame } from "@/components/layout/workflow-frame";
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
  taskId?: string;
}

type DownloadAsset = "mp4" | "srt" | "metadata";
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

export function ResultPage({ projectId, taskId }: ResultPageProps) {
  const router = useRouter();
  const [videoStatus, setVideoStatus] = useState<VideoStatus>("loading");
  const [videoKey, setVideoKey] = useState(0);

  const resultQuery = useQuery({
    queryKey: ["render-results", projectId, taskId],
    queryFn: () => getRenderResult(projectId, {}, taskId),
  });

  const downloadMutation = useMutation({
    mutationFn: async (asset: DownloadAsset) => ({
      asset,
      url: await prepareRenderDownload(projectId, asset, {}, taskId),
    }),
    onSuccess: ({ asset, url }) => {
      const link = document.createElement("a");
      link.href = url;
      link.download =
        asset === "mp4"
          ? "数字人授课视频.mp4"
          : asset === "srt"
            ? "数字人授课字幕.srt"
            : "数字人授课项目元数据.json";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => createRenderJob(projectId),
    onSuccess: (job) =>
      router.push(`/projects/${projectId}/generating?jobId=${job.id}&audioTaskId=${job.id}`),
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
    <WorkflowFrame
      currentStep={4}
      title="授课视频已生成"
      description={`${result.title} 已完成画面、语音与字幕合成，可以预览或下载。`}
      backHref={`/projects/${projectId}`}
      backLabel="返回项目工作台"
      status={<Badge variant="secondary">生成成功</Badge>}
      actions={
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
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {regenerateMutation.isPending ? "正在创建任务…" : "重新生成"}
            </Button>
          }
        />
      }
    >
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

      <div className="grid overflow-hidden rounded-lg border border-foreground/18 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch">
        <section
          className="min-w-0 overflow-hidden border-b border-foreground/18 bg-card lg:border-r lg:border-b-0"
          aria-labelledby="video-preview-title"
        >
          <div className="flex items-center justify-between gap-3 border-b border-foreground/12 px-4 py-3 sm:px-5">
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
              <div className="relative aspect-video overflow-hidden bg-secondary">
                {result.posterUrl ? (
                  <Image
                    src={result.posterUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 70vw, 100vw"
                    className="object-cover object-center mix-blend-multiply"
                  />
                ) : null}
              </div>
            )}
          </div>
          <div
            id="video-load-status"
            className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
            aria-live="polite"
          >
            <p className="text-sm text-muted-foreground">
              {!result.videoUrl
                ? "演示环境暂未接入真实视频，当前显示课程封面。"
                : videoStatus === "loading"
                  ? "正在加载视频封面与播放信息…"
                : videoStatus === "error"
                  ? "视频加载失败，可以重试或下载 MP4。"
                  : "视频已就绪，可直接播放并开启中文字幕。"}
            </p>
            {result.videoUrl && videoStatus === "loading" ? (
              <Spinner aria-hidden="true" />
            ) : result.videoUrl && videoStatus === "error" ? (
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

        <aside className="flex flex-col gap-6 bg-secondary/38 p-5 sm:p-6">
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
            <Button
              type="button"
              variant="outline"
              disabled={downloadUnavailable || downloadMutation.isPending || !taskId}
              onClick={() => downloadMutation.mutate("metadata")}
            >
              {downloadMutation.isPending && downloadMutation.variables === "metadata" ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <DownloadIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {downloadMutation.isPending && downloadMutation.variables === "metadata"
                ? "正在准备元数据…"
                : "下载项目元数据"}
            </Button>
          </div>

          {downloadUnavailable ? (
            <p className="text-sm text-muted-foreground">
              下载文件暂不可用，请稍后重新加载结果页。
            </p>
          ) : null}
        </aside>
      </div>

      {result.validation ? (
        <section className="rounded-lg border border-foreground/18 bg-card p-5" aria-labelledby="validation-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="validation-title" className="font-semibold">媒体硬门验证</h2>
              <p className="mt-1 text-sm text-muted-foreground">最终资产只有通过以下服务端检查后才可交付。</p>
            </div>
            <Badge variant="secondary">全部通过</Badge>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <ValidationItem label="编码" value={`${result.validation.videoCodec.toUpperCase()} / ${result.validation.audioCodec.toUpperCase()}`} />
            <ValidationItem label="完整解码" value={result.validation.fullDecode ? "通过" : "失败"} />
            <ValidationItem label="Fast Start" value={result.validation.fastStart ? "通过" : "失败"} />
            <ValidationItem label="非静音" value={result.validation.nonSilent ? "通过" : "失败"} />
            <ValidationItem label="页面覆盖" value={`${result.validation.pageCoverage.length}/${result.validation.pageCount}`} />
            <ValidationItem label="安全区" value={result.validation.obstructionClear ? "通过" : "失败"} />
            <ValidationItem label="帧率" value={`${result.validation.fps} FPS`} />
            <ValidationItem label="黑帧上限" value={`${result.validation.maxBlackDurationMs} ms`} />
          </dl>
        </section>
      ) : null}

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

      <p className="text-sm text-muted-foreground">
        {result.assetsAvailable
          ? "播放与下载均通过受控同源地址读取；重新加载清单不会触发重新渲染。"
          : "当前为本地演示数据，真实交付文件暂不可用。"}
      </p>
    </WorkflowFrame>
  );
}

function ValidationItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/55 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
