import { ClapperboardIcon, SaveIcon } from "lucide-react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import type { WorkspaceSaveState } from "./workspace-header";

interface WorkspaceActionsProps {
  saveState: WorkspaceSaveState;
  canSaveScripts: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  generateDisabledReason?: string;
  onSave: () => void;
  onGenerate: () => void;
}

export function WorkspaceActions({
  saveState,
  canSaveScripts,
  canGenerate,
  isGenerating,
  generateDisabledReason,
  onSave,
  onGenerate,
}: WorkspaceActionsProps) {
  return (
    <footer className="sticky inset-x-0 bottom-0 z-30 flex flex-col gap-3 border-t border-foreground/15 bg-card/96 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
      <div className="min-w-0">
        <p className="text-sm font-medium">准备好后生成完整授课视频</p>
        <p
          id="workspace-generate-reason"
          className="text-sm text-muted-foreground"
          aria-live="polite"
        >
          {canGenerate
            ? "系统将使用全部讲稿与当前授课配置。"
            : generateDisabledReason}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!canSaveScripts || saveState === "saving"}
          onClick={onSave}
        >
          {saveState === "saving" ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : (
            <SaveIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {saveState === "saving" ? "保存中…" : "保存讲稿"}
        </Button>
        <ConfirmDialog
          title="开始生成授课视频？"
          description="系统将使用全部幻灯片讲稿与当前授课配置。生成通常需要几分钟，你可以让任务在后台继续。"
          confirmLabel="开始生成"
          disabled={!canGenerate || isGenerating}
          onConfirm={onGenerate}
          trigger={
            <Button
              type="button"
              disabled={!canGenerate || isGenerating}
              aria-describedby="workspace-generate-reason"
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
    </footer>
  );
}
