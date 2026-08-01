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

interface ProjectListProps {
  variant?: "default" | "stage";
}

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

export function ProjectList({ variant = "default" }: ProjectListProps) {
  const isStage = variant === "stage";
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
    return <ProjectListSkeleton compact={isStage} />;
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
        actionLabel="新建课程"
        actionHref="/upload"
        icon={PresentationIcon}
      />
    );
  }

  return (
    <div className={cn("flex flex-col", isStage ? "gap-3" : "gap-5")}>
      {deleteMutation.isError ? (
        <ErrorState
          title="删除失败"
          description="项目未被删除，请稍后重试。"
        />
      ) : null}
      <ItemGroup
        className={cn(
          "gap-0 divide-y divide-foreground/12 border-y border-foreground/15",
          isStage && "border-t-0",
        )}
      >
        {projectsQuery.data.map((project) => (
          <Item
            key={project.id}
            variant="default"
            className={cn(
              "min-w-0 rounded-none border-0 px-0 sm:flex-nowrap",
              isStage ? "py-3" : "py-5",
            )}
          >
            <ItemMedia
              variant="icon"
              className={cn(
                "flex items-center justify-center border-0 bg-transparent text-primary",
                isStage ? "size-8" : "size-9",
              )}
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
              <ItemDescription
                className={cn(
                  "flex flex-wrap gap-x-3 gap-y-0.5",
                  isStage && "text-xs",
                )}
              >
                <span>{project.fileName}</span>
                <span>{project.slideCount || "待识别"} 页</span>
                <span>{formatUpdatedAt(project.updatedAt)}更新</span>
              </ItemDescription>
            </ItemContent>
            <ItemActions
              className={cn(
                "ml-12 w-[calc(100%-3rem)] justify-end sm:ml-0 sm:w-auto",
                isStage && "gap-1",
              )}
            >
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
          buttonVariants({
            variant: "outline",
            size: isStage ? "sm" : "default",
          }),
          "self-start",
        )}
      >
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        新建课程
      </Link>
    </div>
  );
}
