"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  PlusIcon,
  PresentationIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { deleteProject, listProjects } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Project, ProjectStatus } from "@/types";

import { ProjectListSkeleton } from "./project-list-skeleton";
import { ProjectStatusBadge } from "./project-status-badge";

function getProjectHref(project: Project): string {
  const statusRoutes: Partial<Record<ProjectStatus, string>> = {
    parsing: `/projects/${project.id}/parsing`,
    rendering: `/projects/${project.id}/generating`,
    completed: `/projects/${project.id}/result`,
  };
  return statusRoutes[project.status] ?? `/projects/${project.id}`;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }
  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

export function ProjectList() {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects(),
  });
  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      }),
  });

  if (projectsQuery.isPending) {
    return <ProjectListSkeleton />;
  }

  if (projectsQuery.isError) {
    return (
      <ErrorState
        title="最近项目加载失败"
        description="暂时无法读取项目列表，已有项目不会受到影响。"
        onRetry={() => projectsQuery.refetch()}
        isRetrying={projectsQuery.isFetching}
      />
    );
  }

  if (projectsQuery.data.length === 0) {
    return (
      <EmptyState
        title="还没有课程项目"
        description="上传一份 PPT 或 PPTX，即可开始整理讲稿和生成授课视频。"
        actionLabel="上传第一个课件"
        actionHref="/upload"
        icon={PresentationIcon}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {deleteMutation.isError ? (
        <ErrorState
          title="删除失败"
          description="项目未被删除，请稍后重试。"
        />
      ) : null}
      <ItemGroup>
        {projectsQuery.data.map((project) => (
          <Item
            key={project.id}
            variant="outline"
            className="min-w-0 bg-card p-4 sm:flex-nowrap"
          >
            <ItemMedia
              variant="icon"
              className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"
            >
              <PresentationIcon aria-hidden="true" />
            </ItemMedia>
            <ItemContent className="min-w-0 basis-[calc(100%-3.5rem)] sm:basis-auto">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <ItemTitle className="min-w-0 max-w-full">
                  {project.title}
                </ItemTitle>
                <ProjectStatusBadge status={project.status} />
              </div>
              <ItemDescription>
                {project.fileName} · {project.slideCount || "待识别"} 页 ·{" "}
                {formatUpdatedAt(project.updatedAt)}更新
              </ItemDescription>
            </ItemContent>
            <ItemActions className="ml-12 w-[calc(100%-3rem)] justify-between sm:ml-0 sm:w-auto sm:justify-end">
              <Badge variant="outline" className="sm:hidden">
                {project.slideCount || "—"} 页
              </Badge>
              <ConfirmDialog
                title={`删除“${project.title}”？`}
                description="项目、讲稿和生成记录将从当前演示中移除。此操作无法撤销。"
                confirmLabel="删除项目"
                destructive
                disabled={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate(project.id)}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`删除项目：${project.title}`}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                }
              />
              <Link
                href={getProjectHref(project)}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                继续编辑
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </Link>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <Link
        href="/upload"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "w-full justify-center",
        )}
      >
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        新建课程项目
      </Link>
    </div>
  );
}
