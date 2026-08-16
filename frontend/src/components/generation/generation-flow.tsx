"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { TaskFlowSkeleton } from "@/components/feedback/task-flow-skeleton";
import { PageContainer } from "@/components/layout/page-container";
import { WorkflowFrame } from "@/components/layout/workflow-frame";
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
  cancelWorkflowJob,
  getWorkflowJob,
  getUserFacingErrorMessage,
  getJob,
  retryJob,
  retryWorkflowJob,
  publishDesktopWorkflowState,
} from "@/lib/api";
import { getEnabledTracerApiAdapter } from "@/lib/api/tracer-adapter";
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
  const realAdapter = getEnabledTracerApiAdapter();

  const createJobMutation = useMutation({
    mutationFn: () => createRenderJob(projectId),
    onSuccess: (job) => {
      setJobId(job.id);
    },
  });

  useEffect(() => {
    if (!jobId && createJobMutation.isIdle) {
      createJobMutation.mutate();
    }
  }, [createJobMutation, jobId]);

  const jobQuery = useQuery({
    queryKey: ["jobs", jobId],
    queryFn: () => realAdapter ? getWorkflowJob(jobId as string) : getJob(jobId as string),
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
    mutationFn: (id: string) => realAdapter ? cancelWorkflowJob(id) : cancelJob(id),
    onSuccess: (job) =>
      queryClient.setQueryData<Job>(["jobs", job.id], job),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => realAdapter
      ? retryWorkflowJob(id)
      : retryJob(id, {}, { projectId }),
    onSuccess: (nextJob) => {
      setJobId(nextJob.id);
      queryClient.setQueryData<Job>(["jobs", nextJob.id], nextJob);
      router.replace(`/projects/${projectId}/generating?jobId=${nextJob.id}`);
    },
  });

  const job = jobQuery.data;

  useEffect(() => {
    void publishDesktopWorkflowState({
      status: !job
        ? "idle"
        : job.status === "completed"
          ? "succeeded"
          : job.status === "failed"
            ? "failed"
            : job.status === "cancelled"
              ? "cancelled"
              : "running",
      stage: job?.currentStageId ?? null,
      progress: job?.progress ?? 0,
    });
  }, [job]);

  useEffect(() => {
    if (job?.status !== "completed") {
      return;
    }
    const timer = window.setTimeout(
      () => router.replace(`/projects/${projectId}/result?jobId=${job.finalTaskId ?? job.id}`),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [job, projectId, router]);

  if (createJobMutation.isPending || (!jobId && !createJobMutation.isError)) {
    return <TaskFlowSkeleton title="正在创建视频生成任务" />;
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
    return <TaskFlowSkeleton title="正在读取视频生成进度" />;
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
    <WorkflowFrame
      currentStep={3}
      title="生成授课视频"
      description={
        activeStage?.description ??
        "正在合成语音、数字人画面与中文字幕。"
      }
      backHref={`/projects/${projectId}`}
      backLabel="返回项目工作台"
      status={
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
      }
      actions={
        job.status === "running" || job.status === "queued" ? (
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
        ) : undefined
      }
    >
      <section
        className="mx-auto flex w-full max-w-4xl flex-col gap-7"
        aria-labelledby="generation-progress-title"
      >
        <Progress value={job.progress}>
          <ProgressLabel id="generation-progress-title">
            {activeStage?.label ?? "视频生成"}
          </ProgressLabel>
          <ProgressValue />
        </Progress>
        <p className="sr-only" role="status" aria-live="polite">
          {job.status === "running"
            ? `当前阶段：${activeStage?.label ?? "视频生成"}`
            : job.status === "completed"
              ? "授课视频生成完成"
              : job.status === "failed"
                ? "授课视频生成失败"
                : "视频生成已取消"}
        </p>

        {cancelMutation.isError || retryMutation.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>任务操作失败</AlertTitle>
            <AlertDescription>
              {getUserFacingErrorMessage(
                cancelMutation.error ?? retryMutation.error,
                "请求没有生效，请检查连接后重试。",
              )}
            </AlertDescription>
          </Alert>
        ) : null}
        {job.status === "failed" ? (
          <ErrorState
            title="视频生成失败"
            description={job.error ?? "生成过程中发生错误，请重新生成。"}
            retryLabel={job.retryable === false ? undefined : "重试失败阶段"}
            onRetry={job.retryable === false ? undefined : () => retryMutation.mutate(job.id)}
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

        {job.currentSlideId ? (
          <p className="text-sm text-muted-foreground">
            当前处理页面：{job.currentSlideId}
          </p>
        ) : null}

        {job.status === "running" && realAdapter ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            服务端工作流已持久化当前阶段，关闭浏览器不会中断后续推进。
          </p>
        ) : null}

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
    </WorkflowFrame>
  );
}
