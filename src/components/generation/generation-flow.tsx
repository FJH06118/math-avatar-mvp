"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  RotateCcwIcon,
  SquareIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageContainer } from "@/components/layout/page-container";
import { JobStageList } from "@/components/parsing/job-stage-list";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  cancelJob,
  createRenderJob,
  getUserFacingErrorMessage,
  getJob,
  retryJob,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Job } from "@/types";

interface GenerationFlowProps {
  projectId: string;
  initialJobId?: string;
}

export function GenerationFlow({
  projectId,
  initialJobId,
}: GenerationFlowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState(initialJobId);

  const createJobMutation = useMutation({
    mutationFn: () => createRenderJob(projectId),
    onSuccess: (job) => setJobId(job.id),
  });

  useEffect(() => {
    if (!jobId && createJobMutation.isIdle) {
      createJobMutation.mutate();
    }
  }, [createJobMutation, jobId]);

  const jobQuery = useQuery({
    queryKey: ["jobs", jobId],
    queryFn: () => getJob(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const job = query.state.data;
      return job?.status === "completed" ||
        job?.status === "failed" ||
        job?.status === "cancelled"
        ? false
        : 500;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelJob(id),
    onSuccess: (job) =>
      queryClient.setQueryData<Job>(["jobs", job.id], job),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryJob(id),
    onSuccess: (job) =>
      queryClient.setQueryData<Job>(["jobs", job.id], job),
  });

  const job = jobQuery.data;

  useEffect(() => {
    if (job?.status !== "completed") {
      return;
    }
    const timer = window.setTimeout(
      () => router.replace(`/projects/${projectId}/result`),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [job?.status, projectId, router]);

  if (createJobMutation.isPending || (!jobId && !createJobMutation.isError)) {
    return (
      <PageContainer className="py-10 sm:py-14">
        <LoadingState
          title="正在创建视频生成任务"
          description="正在检查课程讲稿与授课配置。"
        />
      </PageContainer>
    );
  }

  if (createJobMutation.isError) {
    return (
      <PageContainer className="py-10 sm:py-14">
        <ErrorState
          title="无法开始生成视频"
          description={getUserFacingErrorMessage(
            createJobMutation.error,
            "暂时无法创建视频生成任务，请检查连接后重试。",
          )}
          onRetry={() => createJobMutation.mutate()}
          isRetrying={createJobMutation.isPending}
        />
      </PageContainer>
    );
  }

  if (jobQuery.isPending) {
    return (
      <PageContainer className="py-10 sm:py-14">
        <LoadingState
          title="正在读取生成进度"
          description="视频生成任务已经开始，请稍候。"
        />
      </PageContainer>
    );
  }

  if (jobQuery.isError || !job) {
    return (
      <PageContainer className="flex flex-col gap-4 py-10 sm:py-14">
        <ErrorState
          title="生成进度加载失败"
          description={getUserFacingErrorMessage(
            jobQuery.error,
            "没有找到对应的视频生成任务，请创建新任务。",
          )}
          onRetry={() => jobQuery.refetch()}
          isRetrying={jobQuery.isFetching}
        />
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={createJobMutation.isPending}
          onClick={() => createJobMutation.mutate()}
        >
          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
          创建新的生成任务
        </Button>
      </PageContainer>
    );
  }

  const activeStage = job.stages.find(
    (stage) => stage.id === job.currentStageId,
  );

  return (
    <PageContainer className="flex flex-col gap-8 py-10 sm:py-14">
      <div className="flex flex-col gap-5">
        <Link
          href={`/projects/${projectId}`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "self-start",
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          返回项目工作台
        </Link>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex max-w-2xl flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-primary">第 4 步，共 5 步</p>
              <Badge
                variant={job.status === "failed" ? "destructive" : "secondary"}
              >
                {job.status === "completed"
                  ? "生成完成"
                  : job.status === "failed"
                    ? "生成失败"
                    : job.status === "cancelled"
                      ? "已取消"
                      : "生成中"}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
              生成数字人授课视频
            </h1>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              {activeStage?.description ??
                "正在合成语音、数字人画面与中文字幕。"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {job.status === "running" ? (
              <>
                <Link
                  href="/"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  <ExternalLinkIcon
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                  返回列表，后台继续
                </Link>
                <ConfirmDialog
                  title="取消视频生成？"
                  description="当前生成进度会停止。已保存的讲稿和授课配置不会丢失。"
                  confirmLabel="取消生成"
                  onConfirm={() => cancelMutation.mutate(job.id)}
                  disabled={cancelMutation.isPending}
                  trigger={
                    <Button type="button" variant="outline">
                      {cancelMutation.isPending ? (
                        <Spinner
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                      ) : (
                        <SquareIcon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                      )}
                      {cancelMutation.isPending ? "取消中…" : "取消任务"}
                    </Button>
                  }
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      <section
        className="flex flex-col gap-6 rounded-2xl border bg-card p-5 sm:p-6"
        aria-labelledby="generation-progress-title"
      >
        <Progress value={job.progress}>
          <ProgressLabel id="generation-progress-title">
            {activeStage?.label ?? "视频生成"}
          </ProgressLabel>
          <ProgressValue />
        </Progress>

        {job.status === "failed" ? (
          <ErrorState
            title="视频生成失败"
            description={job.error ?? "生成过程中发生错误，请重新生成。"}
            retryLabel="重新生成"
            onRetry={() => retryMutation.mutate(job.id)}
            isRetrying={retryMutation.isPending}
          />
        ) : null}

        {job.status === "cancelled" ? (
          <Alert>
            <AlertTitle>视频生成任务已取消</AlertTitle>
            <AlertDescription>
              讲稿与授课配置已保留，可以重新生成或返回工作台继续编辑。
            </AlertDescription>
          </Alert>
        ) : null}

        {job.status === "completed" ? (
          <Alert>
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>授课视频生成完成</AlertTitle>
            <AlertDescription>
              MP4 与字幕文件已准备好，正在进入视频结果页。
            </AlertDescription>
          </Alert>
        ) : null}

        <JobStageList stages={job.stages} />

        {job.status === "cancelled" ? (
          <Button
            type="button"
            className="self-start"
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate(job.id)}
          >
            {retryMutation.isPending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {retryMutation.isPending ? "正在重新启动…" : "重新生成"}
          </Button>
        ) : null}
      </section>
    </PageContainer>
  );
}
