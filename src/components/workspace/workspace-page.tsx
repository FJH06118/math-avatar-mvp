"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  getProject,
  createRenderJob,
  getUserFacingErrorMessage,
  listAvatars,
  listSlides,
  listVoices,
  updateSlideScript,
} from "@/lib/api";
import type { Avatar, ParsedSlide, Project, Voice } from "@/types";

import {
  SlideContentTabs,
  type WorkspaceTab,
} from "./slide-content-tabs";
import { SlideSidebar } from "./slide-sidebar";
import { TeachingSettingsForm } from "./teaching-settings-form";
import { WorkspaceActions } from "./workspace-actions";
import {
  WorkspaceHeader,
  type WorkspaceSaveState,
} from "./workspace-header";
import { WorkspaceSkeleton } from "./workspace-skeleton";

interface WorkspacePageProps {
  projectId: string;
}

interface WorkspaceData {
  project: Project;
  slides: ParsedSlide[];
  avatars: Avatar[];
  voices: Voice[];
}

type SlideDrafts = Record<string, string>;

export function WorkspacePage({ projectId }: WorkspacePageProps) {
  const workspaceQuery = useQuery({
    queryKey: ["workspace", projectId],
    queryFn: async (): Promise<WorkspaceData> => {
      const [project, slides, avatars, voices] = await Promise.all([
        getProject(projectId),
        listSlides(projectId),
        listAvatars(),
        listVoices(),
      ]);
      return { project, slides, avatars, voices };
    },
  });

  if (workspaceQuery.isPending) {
    return <WorkspaceSkeleton />;
  }

  if (workspaceQuery.isError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <ErrorState
          title="无法打开项目工作台"
          description={getUserFacingErrorMessage(
            workspaceQuery.error,
            "项目内容加载失败，请检查连接后重试。",
          )}
          isRetrying={workspaceQuery.isFetching}
          onRetry={() => void workspaceQuery.refetch()}
        />
      </div>
    );
  }

  return <WorkspaceLoaded data={workspaceQuery.data} />;
}

function WorkspaceLoaded({ data }: { data: WorkspaceData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const requestedSlideId = searchParams.get("slide");
  const requestedTab = searchParams.get("tab");
  const [selectedSlideId, setSelectedSlideId] = useState(
    data.slides.some((slide) => slide.id === requestedSlideId)
      ? (requestedSlideId as string)
      : (data.slides[0]?.id ?? ""),
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    requestedTab === "content" ||
      requestedTab === "script" ||
      requestedTab === "formulas"
      ? requestedTab
      : "preview",
  );
  const [drafts, setDrafts] = useState<SlideDrafts>({});
  const [scriptSaveState, setScriptSaveState] =
    useState<WorkspaceSaveState>("saved");
  const [settingsSaveState, setSettingsSaveState] =
    useState<WorkspaceSaveState>("saved");
  const [settingsValid, setSettingsValid] = useState(true);
  const savingSnapshotRef = useRef<SlideDrafts>({});

  const selectedSlide =
    data.slides.find((slide) => slide.id === selectedSlideId) ??
    data.slides[0];

  const dirtyDrafts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(drafts).filter(([slideId, script]) => {
          const original = data.slides.find((slide) => slide.id === slideId);
          return original && original.teachingScript !== script;
        }),
      ),
    [data.slides, drafts],
  );
  const dirtyEntries = Object.entries(dirtyDrafts);
  const hasUnsavedScripts = dirtyEntries.length > 0;
  const hasUnsavedChanges =
    hasUnsavedScripts ||
    settingsSaveState === "unsaved" ||
    settingsSaveState === "saving" ||
    settingsSaveState === "error";
  const isSaving =
    scriptSaveState === "saving" || settingsSaveState === "saving";
  const hasSaveError =
    scriptSaveState === "error" || settingsSaveState === "error";
  const combinedSaveState: WorkspaceSaveState = hasSaveError
    ? "error"
    : isSaving
      ? "saving"
      : hasUnsavedChanges
        ? "unsaved"
        : "saved";

  const canGenerate =
    settingsValid &&
    !hasSaveError &&
    !hasUnsavedChanges &&
    !isSaving &&
    data.slides.length > 0 &&
    data.slides.every((slide) =>
      (drafts[slide.id] ?? slide.teachingScript).trim(),
    );

  const generateDisabledReason = !settingsValid
    ? "请先补全授课配置。"
    : hasSaveError
      ? "保存失败，请先重新保存讲稿或授课配置。"
    : hasUnsavedChanges || isSaving
      ? "请等待讲稿和授课配置保存完成。"
      : data.slides.some(
            (slide) => !(drafts[slide.id] ?? slide.teachingScript).trim(),
          )
        ? "每一页都需要填写授课讲稿。"
        : data.slides.length === 0
          ? "项目中没有可生成的幻灯片。"
          : undefined;

  const saveMutation = useMutation({
    mutationFn: async (snapshot: SlideDrafts) =>
      Promise.all(
        Object.entries(snapshot).map(([slideId, teachingScript]) =>
          updateSlideScript(slideId, { teachingScript }),
        ),
      ),
    onMutate: (snapshot) => {
      savingSnapshotRef.current = snapshot;
      setScriptSaveState("saving");
    },
    onSuccess: (updatedSlides) => {
      queryClient.setQueryData<WorkspaceData>(
        ["workspace", data.project.id],
        (current) =>
          current
            ? {
                ...current,
                slides: current.slides.map(
                  (slide) =>
                    updatedSlides.find((updated) => updated.id === slide.id) ??
                    slide,
                ),
              }
            : current,
      );
      setDrafts((current) => {
        const next = { ...current };
        for (const [slideId, savedScript] of Object.entries(
          savingSnapshotRef.current,
        )) {
          if (current[slideId] === savedScript) {
            delete next[slideId];
          }
        }
        return next;
      });
      setScriptSaveState("saved");
    },
    onError: () => setScriptSaveState("error"),
  });

  const createRenderMutation = useMutation({
    mutationFn: () => createRenderJob(data.project.id),
    onSuccess: (job) =>
      router.push(
        `/projects/${data.project.id}/generating?jobId=${job.id}`,
      ),
  });

  const saveScripts = useCallback(() => {
    if (dirtyEntries.length === 0 || saveMutation.isPending) {
      return;
    }
    saveMutation.mutate(Object.fromEntries(dirtyEntries));
  }, [dirtyEntries, saveMutation]);

  useEffect(() => {
    if (!hasUnsavedScripts || saveMutation.isPending) {
      return;
    }
    const timeoutId = setTimeout(saveScripts, 800);
    return () => clearTimeout(timeoutId);
  }, [hasUnsavedScripts, saveMutation.isPending, saveScripts]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  function handleScriptChange(value: string) {
    if (!selectedSlide) {
      return;
    }
    setScriptSaveState("unsaved");
    setDrafts((current) => ({ ...current, [selectedSlide.id]: value }));
  }

  function replaceWorkspaceState(
    nextSlideId: string,
    nextTab: WorkspaceTab,
  ) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("slide", nextSlideId);
    params.set("tab", nextTab);
    router.replace(
      `/projects/${data.project.id}?${params.toString()}`,
      { scroll: false },
    );
  }

  function handleSlideSelect(slideId: string) {
    setSelectedSlideId(slideId);
    replaceWorkspaceState(slideId, activeTab);
  }

  function handleTabChange(tab: WorkspaceTab) {
    setActiveTab(tab);
    replaceWorkspaceState(selectedSlide.id, tab);
  }

  if (!selectedSlide) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <EmptyState
          title="项目中还没有幻灯片"
          description="请重新上传课件，系统会解析页面并生成初始讲稿。"
          actionLabel="上传课件"
          actionHref="/upload"
        />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-muted/30">
      <WorkspaceHeader
        project={data.project}
        saveState={combinedSaveState}
        hasUnsavedChanges={hasUnsavedChanges}
        canSaveScripts={hasUnsavedScripts}
        canGenerate={canGenerate}
        isGenerating={createRenderMutation.isPending}
        generateDisabledReason={generateDisabledReason}
        onSave={saveScripts}
        onGenerate={() => createRenderMutation.mutate()}
      />

      <div className="grid min-w-0 gap-4 p-4 sm:p-6 xl:grid-cols-[15rem_minmax(0,1fr)_20rem] xl:items-start lg:p-8">
        <SlideSidebar
          slides={data.slides}
          selectedSlideId={selectedSlide.id}
          onSelect={handleSlideSelect}
        />
        <SlideContentTabs
          slide={selectedSlide}
          scriptValue={
            drafts[selectedSlide.id] ?? selectedSlide.teachingScript
          }
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onScriptChange={handleScriptChange}
        />
        <TeachingSettingsForm
          projectId={data.project.id}
          settings={data.project.settings}
          avatars={data.avatars}
          voices={data.voices}
          onSaveStateChange={setSettingsSaveState}
          onValidityChange={setSettingsValid}
        />
      </div>

      {createRenderMutation.isError ? (
        <div className="px-4 pb-4 sm:px-6 lg:px-8">
          <Alert variant="destructive" role="alert">
            <AlertTitle>无法创建视频生成任务</AlertTitle>
            <AlertDescription>
              {getUserFacingErrorMessage(
                createRenderMutation.error,
                "暂时无法创建生成任务，请稍后重试。",
              )}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <WorkspaceActions
        saveState={combinedSaveState}
        canSaveScripts={hasUnsavedScripts}
        canGenerate={canGenerate}
        isGenerating={createRenderMutation.isPending}
        generateDisabledReason={generateDisabledReason}
        onSave={saveScripts}
        onGenerate={() => createRenderMutation.mutate()}
      />
    </div>
  );
}
