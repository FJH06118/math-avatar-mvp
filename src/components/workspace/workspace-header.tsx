"use client";

import {
  ArrowLeftIcon,
  ClapperboardIcon,
  SaveIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

import { WorkspaceSteps } from "./workspace-steps";

export type WorkspaceSaveState =
  | "saved"
  | "unsaved"
  | "saving"
  | "error";

const saveLabels: Record<WorkspaceSaveState, string> = {
  saved: "已保存",
  unsaved: "有未保存更改",
  saving: "保存中…",
  error: "保存失败",
};

interface WorkspaceHeaderProps {
  project: Project;
  saveState: WorkspaceSaveState;
  hasUnsavedChanges: boolean;
  canSaveScripts: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  generateDisabledReason?: string;
  onSave: () => void;
  onGenerate: () => void;
}

export function WorkspaceHeader({
  project,
  saveState,
  hasUnsavedChanges,
  canSaveScripts,
  canGenerate,
  isGenerating,
  generateDisabledReason,
  onSave,
  onGenerate,
}: WorkspaceHeaderProps) {
  const router = useRouter();
  const backControl = (
    <Button type="button" variant="ghost" size="sm">
      <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
      返回项目列表
    </Button>
  );

  return (
    <section className="flex flex-col gap-5 border-b bg-card px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {hasUnsavedChanges ? (
            <ConfirmDialog
              title="离开项目工作台？"
              description="仍有讲稿或授课配置尚未保存。离开后，这些更改可能丢失。"
              confirmLabel="放弃更改并离开"
              destructive
              onConfirm={() => router.push("/")}
              trigger={backControl}
            />
          ) : (
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
              )}
            >
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              返回项目列表
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {project.title}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {project.fileName}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={saveState === "error" ? "destructive" : "secondary"}
          >
            {saveState === "saving" ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : null}
            {saveLabels[saveState]}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canSaveScripts || saveState === "saving"}
            onClick={onSave}
          >
            <SaveIcon data-icon="inline-start" aria-hidden="true" />
            保存讲稿
          </Button>
          <ConfirmDialog
            title="开始生成授课视频？"
            description="系统将使用全部幻灯片讲稿与当前授课配置。开始后仍可返回项目列表，让任务在后台继续。"
            confirmLabel="开始生成"
            disabled={!canGenerate || isGenerating}
            onConfirm={onGenerate}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canGenerate || isGenerating}
                aria-describedby={
                  !canGenerate ? "header-generate-disabled-reason" : undefined
                }
              >
                {isGenerating ? (
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                ) : (
                  <ClapperboardIcon
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                )}
                {isGenerating ? "正在创建任务…" : "生成授课视频"}
              </Button>
            }
          />
        </div>
      </div>
      {!canGenerate && generateDisabledReason ? (
        <p
          id="header-generate-disabled-reason"
          className="text-sm text-muted-foreground lg:text-right"
        >
          {generateDisabledReason}
        </p>
      ) : null}
      <WorkspaceSteps />
    </section>
  );
}
