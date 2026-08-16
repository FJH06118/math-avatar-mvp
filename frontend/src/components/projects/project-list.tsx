"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  ArrowRightIcon,
  CopyIcon,
  PlusIcon,
  PresentationIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

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
import {
  archiveProject,
  copyProject,
  deleteProject,
  getUserFacingErrorMessage,
  listProjects,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Project, ProjectStatus } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ProjectListSkeleton } from "./project-list-skeleton";
import { ProjectStatusBadge } from "./project-status-badge";

interface ProjectListProps {
  variant?: "default" | "stage";
}

type ProjectFilter = "all" | ProjectStatus;
type ProjectAction = {
  kind: "copy" | "archive" | "delete";
  project: Project;
  idempotencyKey?: string;
};

const filterLabels: Record<ProjectFilter, string> = {
  all: "全部项目",
  draft: "草稿",
  uploading: "上传中",
  parsing: "解析中",
  ready: "待生成",
  rendering: "生成中",
  completed: "已完成",
  failed: "需处理",
  archived: "已归档",
};

function getProjectHref(project: Project): string {
  const statusRoutes: Partial<Record<ProjectStatus, string>> = {
    parsing: `/projects/${project.id}/parsing${
      project.parsingJobId ? `?jobId=${encodeURIComponent(project.parsingJobId)}` : ""
    }`,
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
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<ProjectFilter>("all");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const projectsQuery = useQuery({
    queryKey: ["projects", deferredSearch, status],
    queryFn: ({ signal }) =>
      listProjects(
        {
          search: deferredSearch,
          status: status === "all" ? undefined : status,
          includeArchived: status === "archived",
        },
        { signal },
      ),
    placeholderData: (previousData) => previousData,
  });
  const actionMutation = useMutation({
    mutationFn: async (action: ProjectAction) => {
      if (action.kind === "copy") {
        return copyProject(action.project.id, {
          idempotencyKey:
            action.idempotencyKey ?? `copy_${crypto.randomUUID()}`,
        });
      }
      if (action.kind === "archive") {
        return archiveProject(action.project.id, action.project.version);
      }
      await deleteProject(action.project.id, action.project.version);
      return undefined;
    },
    onMutate: () => {
      setActionMessage(null);
    },
    onSuccess: (_result, action) => {
      setActionMessage(
        action.kind === "copy"
          ? `已创建“${action.project.title}”的副本。`
          : action.kind === "archive"
            ? `“${action.project.title}”已归档。`
            : `“${action.project.title}”已删除。`,
      );
      return queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
    },
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

  const hasFilters = deferredSearch.length > 0 || status !== "all";

  if (projectsQuery.data.length === 0 && !hasFilters) {
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1" htmlFor="project-search">
          <span className="sr-only">搜索项目</span>
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="project-search"
            name="project-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索项目或课件名称"
            className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 sm:text-sm"
          />
        </label>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ProjectFilter)}
        >
          <SelectTrigger className="w-full sm:w-36" aria-label="按状态筛选项目">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(filterLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {actionMessage ? (
        <p className="text-base text-muted-foreground sm:text-sm" aria-live="polite">
          {actionMessage}
        </p>
      ) : null}

      {actionMutation.isError ? (
        <ErrorState
          title="项目操作失败"
          description={getUserFacingErrorMessage(
            actionMutation.error,
            "项目没有发生变化，请刷新后重试。",
          )}
          onRetry={
            actionMutation.variables
              ? () => actionMutation.mutate(actionMutation.variables)
              : undefined
          }
          isRetrying={actionMutation.isPending}
        />
      ) : null}
      {projectsQuery.data.length === 0 ? (
        <EmptyState
          title="没有匹配的项目"
          description="调整搜索词或状态筛选后再试。"
          actionLabel="清除筛选"
          onAction={() => {
            setSearch("");
            setStatus("all");
          }}
          icon={SearchIcon}
        />
      ) : (
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
              {project.status !== "archived" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative"
                  disabled={actionMutation.isPending}
                  aria-label={`复制项目：${project.title}`}
                  onClick={() =>
                    actionMutation.mutate({
                      kind: "copy",
                      project,
                      idempotencyKey: `copy_${crypto.randomUUID()}`,
                    })
                  }
                >
                  <CopyIcon aria-hidden="true" />
                  <span
                    className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
                    aria-hidden="true"
                  />
                </Button>
              ) : null}
              {project.status !== "archived" ? (
                <ConfirmDialog
                  title={`归档“${project.title}”？`}
                  description="归档后项目会从默认列表隐藏，生成中的项目不能归档。"
                  confirmLabel="归档项目"
                  disabled={actionMutation.isPending}
                  onConfirm={() =>
                    actionMutation.mutate({ kind: "archive", project })
                  }
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="relative"
                      aria-label={`归档项目：${project.title}`}
                    >
                      <ArchiveIcon aria-hidden="true" />
                      <span
                        className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
                        aria-hidden="true"
                      />
                    </Button>
                  }
                />
              ) : null}
              <ConfirmDialog
                title={`删除“${project.title}”？`}
                description="项目、讲稿和生成记录将从当前演示中移除。此操作无法撤销。"
                confirmLabel="删除项目"
                destructive
                disabled={actionMutation.isPending}
                onConfirm={() =>
                  actionMutation.mutate({ kind: "delete", project })
                }
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label={`删除项目：${project.title}`}
                  >
                    <Trash2Icon aria-hidden="true" />
                    <span
                      className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
                      aria-hidden="true"
                    />
                  </Button>
                }
              />
              {project.status !== "archived" ? (
                <Link
                  href={getProjectHref(project)}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  继续编辑
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                </Link>
              ) : null}
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      )}
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
