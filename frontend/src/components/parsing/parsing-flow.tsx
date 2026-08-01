"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  RotateCcwIcon,
  SquareIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageContainer } from "@/components/layout/page-container";
import { WorkflowFrame } from "@/components/layout/workflow-frame";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  cancelJob,
  createParsingJob,
  getUserFacingErrorMessage,
  getJob,
  retryJob,
} from "@/lib/api";
import type { Job } from "@/types";

import { JobStageList } from "./job-stage-list";

interface ParsingFlowProps {
  projectId: string;
  initialJobId?: string;
}

export function ParsingFlow({
  projectId,
  initialJobId,
}: ParsingFlowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState(initialJobId);

  const createJobMutation = useMutation({
    mutationFn: () => createParsingJob(projectId),
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
      () => router.replace(`/projects/${projectId}`),
      900,
    );
    return () => window.clearTimeout(timer);
  }, [job?.status, projectId, router]);

  if (createJobMutation.isPending || (!jobId && !createJobMutation.isError)) {
    return (
      <PageContainer className="py-10 sm:py-14">
        <LoadingState
          title="正在创建解析任务"
          description="即将开始检查课件内容。"
        />
      </PageContainer>
    );
  }

  if (createJobMutation.isError) {
    return (
      <PageContainer className="py-10 sm:py-14">
        <ErrorState
          title="无法开始解析"
          description={getUserFacingErrorMessage(
            createJobMutation.error,
            "暂时无法创建课件解析任务，请检查连接后重试。",
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
          title="正在读取解析进度"
          description="解析任务已经开始，请稍候。"
        />
      </PageContainer>
    );
  }

  if (jobQuery.isError || !job) {
    return (
      <PageContainer className="py-10 sm:py-14">
        <ErrorState
          title="解析进度加载失败"
          description={getUserFacingErrorMessage(
            jobQuery.error,
            "没有找到对应的课件解析任务，请重新创建任务。",
          )}
          onRetry={() => jobQuery.refetch()}
          isRetrying={jobQuery.isFetching}
        />
      </PageContainer>
    );
  }

  const activeStage = job.stages.find(
    (stage) => stage.id === job.currentStageId,
  );

  return (
    <WorkflowFrame
      currentStep={1}
      title="解析课程课件"
      description={
        activeStage?.description ??
        "正在整理课件页面、数学公式和初始讲稿。"
      }
      backHref="/"
      backLabel="返回项目列表"
      status={
        <Badge
          variant={job.status === "failed" ? "destructive" : "secondary"}
        >
          {job.status === "completed"
            ? "解析完成"
            : job.status === "failed"
              ? "解析失败"
              : job.status === "cancelled"
                ? "已取消"
                : "解析中"}
        </Badge>
      }
      actions={
        job.status === "running" ? (
          <ConfirmDialog
            title="取消课件解析？"
            description="当前解析进度会停止，你可以稍后从项目列表重新开始。"
            confirmLabel="取消解析"
            onConfirm={() => cancelMutation.mutate(job.id)}
            disabled={cancelMutation.isPending}
            trigger={
              <Button type="button" variant="outline">
                <SquareIcon data-icon="inline-start" aria-hidden="true" />
                取消任务
              </Button>
            }
          />
        ) : undefined
      }
    >
      <section
        className="mx-auto flex w-full max-w-4xl flex-col gap-7"
        aria-labelledby="parsing-progress-title"
      >
        <Progress value={job.progress}>
          <ProgressLabel id="parsing-progress-title">
            {activeStage?.label ?? "课件解析"}
          </ProgressLabel>
          <ProgressValue />
        </Progress>
        <p className="sr-only" role="status" aria-live="polite">
          {job.status === "running"
            ? `当前阶段：${activeStage?.label ?? "课件解析"}`
            : job.status === "completed"
              ? "课件解析完成"
              : job.status === "failed"
                ? "课件解析失败"
                : "课件解析已取消"}
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
            title="课件解析失败"
            description={job.error ?? "解析过程中发生错误，请重新解析。"}
            retryLabel="重新解析"
            onRetry={() => retryMutation.mutate(job.id)}
            isRetrying={retryMutation.isPending}
          />
        ) : null}

        {job.status === "cancelled" ? (
          <Alert>
            <AlertTitle>解析任务已取消</AlertTitle>
            <AlertDescription>
              课件文件已保留，可以立即重新开始解析或返回项目列表。
            </AlertDescription>
          </Alert>
        ) : null}

        {job.status === "completed" ? (
          <Alert>
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>课件解析完成</AlertTitle>
            <AlertDescription>
              已生成页面摘要、公式检查和初始讲稿，正在进入项目工作台。
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
            重新开始解析
          </Button>
        ) : null}
      </section>
    </WorkflowFrame>
  );
}
