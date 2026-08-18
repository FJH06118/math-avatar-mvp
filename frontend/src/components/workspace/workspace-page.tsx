"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  getProject,
  createRenderJob,
  getUserFacingErrorMessage,
  listAvatars,
  listSlides,
  listVoices,
  updateSlideScript,
  setSlideLocked,
  approveSlideRevision,
  getEnabledTracerApiAdapter,
} from "@/lib/api";
import type { Avatar, ParsedSlide, Project, Voice } from "@/types";

import {
  SlideContentTabs,
  type WorkspaceTab,
} from "./slide-content-tabs";
import { SlideSidebar } from "./slide-sidebar";
import { TeachingSettingsForm } from "./teaching-settings-form";
import {
  planFailureMessage,
  planFailureNeedsProviderCheck,
  planIdempotencyKey,
} from "./plan-failure-guidance";
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

interface SlideDraft {
  displayText: string;
  spokenText: string;
}

type SlideDrafts = Record<string, SlideDraft>;

function slideDraft(slide: ParsedSlide): SlideDraft {
  const displayText = slide.displayText ?? slide.teachingScript;
  return {
    displayText,
    spokenText: slide.spokenText ?? displayText,
  };
}

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
  const [previewSettings, setPreviewSettings] = useState(data.project.settings);
  const savingSnapshotRef = useRef<SlideDrafts>({});
  const realAdapter = getEnabledTracerApiAdapter();
  const [planTaskId, setPlanTaskId] = useState(data.project.planTaskId);

  const selectedSlide =
    data.slides.find((slide) => slide.id === selectedSlideId) ??
    data.slides[0];
  const previewAvatar = data.avatars.find(
    (avatar) => avatar.id === previewSettings.avatarId,
  );
  const previewAvatarPosition =
    previewSettings.slideOverrides?.find(
      (override) => override.slideId === selectedSlide?.id,
    )?.avatarPosition ?? previewSettings.avatarPosition;

  const createPlanMutation = useMutation({
    mutationFn: async (failedTaskId?: string) => {
      if (!realAdapter || !data.slides[0]) {
        throw new Error("真实规划服务未启用。");
      }
      return realAdapter.createPlanTask(data.project.id, {
        presentationId: data.slides[0].presentationId,
        idempotencyKey: planIdempotencyKey(
          data.slides[0].presentationId,
          failedTaskId,
        ),
        audience: "大学一年级学生",
        style: "严谨、逐页讲解、保留原页",
        targetMinutes: Math.max(1, Math.round(data.slides.length * 1.5)),
      });
    },
    onSuccess: (task) => setPlanTaskId(task.id),
  });

  const planTaskQuery = useQuery({
    queryKey: ["tasks", planTaskId],
    queryFn: () => realAdapter!.getTask(planTaskId as string),
    enabled: Boolean(realAdapter && planTaskId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED"
        ? false
        : 1_000;
    },
  });

  useEffect(() => {
    if (planTaskQuery.data?.status === "SUCCEEDED") {
      void queryClient.invalidateQueries({ queryKey: ["workspace", data.project.id] });
    }
  }, [data.project.id, planTaskQuery.data?.status, queryClient]);

  const dirtyDrafts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(drafts).filter(([slideId, draft]) => {
          const original = data.slides.find((slide) => slide.id === slideId);
          if (!original) return false;
          const persisted = slideDraft(original);
          return (
            persisted.displayText !== draft.displayText ||
            persisted.spokenText !== draft.spokenText
          );
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

  const missingRevision = data.slides.some(
    (slide) => !slide.lessonPlanRevisionId,
  );
  const pendingApproval = data.slides.some(
    (slide) =>
      Boolean(slide.lessonPlanRevisionId) &&
      slide.lessonPlanApproval !== "approved",
  );
  const canGenerate =
    settingsValid &&
    !hasSaveError &&
    !hasUnsavedChanges &&
    !isSaving &&
    data.slides.length > 0 &&
    !missingRevision &&
    !pendingApproval &&
    data.slides.every((slide) => {
      const draft = drafts[slide.id] ?? slideDraft(slide);
      return draft.displayText.trim() && draft.spokenText.trim();
    }) &&
    data.slides.every(
      (slide) =>
        slide.lessonPlanApproval === "approved" || slide.reviewFlags.length === 0,
    );

  const reviewBlocked = data.slides.some(
    (slide) =>
      slide.lessonPlanApproval !== "approved" && slide.reviewFlags.length > 0,
  );

  const generateDisabledReason = missingRevision
    ? "请先生成并审核全部页面的初始讲稿。"
    : pendingApproval
    ? "请先显式批准全部页面的当前讲稿。"
    : reviewBlocked
    ? "请先处理所有低置信度、解析警告、公式或高风险推导页面，再生成视频。"
    : !settingsValid
    ? "请先补全授课配置。"
    : hasSaveError
      ? "保存失败，请先重新保存讲稿或授课配置。"
    : hasUnsavedChanges || isSaving
      ? "请等待讲稿和授课配置保存完成。"
      : data.slides.some((slide) => {
          const draft = drafts[slide.id] ?? slideDraft(slide);
          return !draft.displayText.trim() || !draft.spokenText.trim();
        })
        ? "每一页都需要填写字幕显示文本和朗读文本。"
        : data.slides.length === 0
          ? "项目中没有可生成的幻灯片。"
          : undefined;

  const saveMutation = useMutation({
    mutationFn: async (snapshot: SlideDrafts) =>
      Promise.all(
        Object.entries(snapshot).map(([slideId, draft]) =>
          updateSlideScript(slideId, draft),
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
        for (const [slideId, savedDraft] of Object.entries(
          savingSnapshotRef.current,
        )) {
          if (current[slideId] === savedDraft) {
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

  const lockMutation = useMutation({
    mutationFn: ({ slide, locked }: { slide: ParsedSlide; locked: boolean }) =>
      setSlideLocked(slide, locked),
    onSuccess: (locked, variables) => {
      queryClient.setQueryData<WorkspaceData>(
        ["workspace", data.project.id],
        (current) => current
          ? {
              ...current,
              slides: current.slides.map((slide) =>
                slide.id === variables.slide.id ? { ...slide, isLocked: locked } : slide,
              ),
            }
          : current,
      );
    },
  });

  const approvalMutation = useMutation({
    mutationFn: (slide: ParsedSlide) => approveSlideRevision(slide),
    onSuccess: (_, approvedSlide) => {
      queryClient.setQueryData<WorkspaceData>(
        ["workspace", data.project.id],
        (current) =>
          current
            ? {
                ...current,
                slides: current.slides.map((slide) =>
                  slide.id === approvedSlide.id
                    ? { ...slide, lessonPlanApproval: "approved" }
                    : slide,
                ),
              }
            : current,
      );
    },
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

  useEffect(() => {
    document.documentElement.dataset.workspaceDirty = hasUnsavedChanges
      ? "true"
      : "false";
    return () => {
      delete document.documentElement.dataset.workspaceDirty;
    };
  }, [hasUnsavedChanges]);

  function handleTextChange(field: keyof SlideDraft, value: string) {
    if (!selectedSlide) {
      return;
    }
    setScriptSaveState("unsaved");
    setDrafts((current) => ({
      ...current,
      [selectedSlide.id]: {
        ...(current[selectedSlide.id] ?? slideDraft(selectedSlide)),
        [field]: value,
      },
    }));
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
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      <WorkspaceHeader
        project={data.project}
        saveState={combinedSaveState}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      <div className="product-surface mx-4 my-4 grid min-w-0 gap-0 overflow-hidden rounded-lg sm:mx-6 sm:my-6 lg:mx-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-stretch xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        <SlideSidebar
          slides={data.slides}
          selectedSlideId={selectedSlide.id}
          onSelect={handleSlideSelect}
        />
        <SlideContentTabs
          slide={selectedSlide}
          avatar={previewAvatar}
          avatarPosition={previewAvatarPosition}
          displayText={(drafts[selectedSlide.id] ?? slideDraft(selectedSlide)).displayText}
          spokenText={(drafts[selectedSlide.id] ?? slideDraft(selectedSlide)).spokenText}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onDisplayTextChange={(value) => handleTextChange("displayText", value)}
          onSpokenTextChange={(value) => handleTextChange("spokenText", value)}
          onLockChange={(locked) => lockMutation.mutate({ slide: selectedSlide, locked })}
          isLocking={lockMutation.isPending}
          onApprove={() => approvalMutation.mutate(selectedSlide)}
          isApproving={approvalMutation.isPending}
        />
        <TeachingSettingsForm
          projectId={data.project.id}
          presentationId={selectedSlide.presentationId}
          settings={data.project.settings}
          avatars={data.avatars}
          voices={data.voices}
          onSaveStateChange={setSettingsSaveState}
          onValidityChange={setSettingsValid}
          onPreviewSettingsChange={setPreviewSettings}
          selectedSlideId={selectedSlide.id}
          selectedSlideTitle={selectedSlide.title}
          previewAvailable={!missingRevision}
          previewUnavailableReason={missingRevision ? "请先重试规划并生成初始讲稿；当前尚未调用 Edge TTS。" : undefined}
        />
      </div>

      {realAdapter && missingRevision ? (
        <div className="px-4 pb-4 sm:px-6 lg:px-8">
          <Alert>
            <AlertTitle>初始讲稿尚未生成</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex flex-col items-start gap-1">
                {createPlanMutation.isError
                  ? getUserFacingErrorMessage(
                      createPlanMutation.error,
                      "规划任务创建失败，请检查连接后重试。",
                    )
                  : planTaskQuery.data?.status === "FAILED"
                  ? `规划失败：${planFailureMessage(planTaskQuery.data.errorCode, planTaskQuery.data.errorMessage)}`
                  : planTaskId
                    ? `服务端正在规划讲稿，已完成 ${planTaskQuery.data?.progressCompleted ?? 0}/${planTaskQuery.data?.progressTotal ?? data.slides.length} 页。`
                    : "创建真实规划任务后，工作台会读取逐页 revision；不会使用占位讲稿进入生成。"}
                {planTaskQuery.data?.status === "FAILED" && planFailureNeedsProviderCheck(planTaskQuery.data.errorCode, planTaskQuery.data.errorMessage) ? (
                  <Link href="/settings" className="font-medium text-primary underline underline-offset-4">
                    检查 Provider 并重新测试连接
                  </Link>
                ) : null}
              </span>
              {!planTaskId || planTaskQuery.data?.status === "FAILED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={createPlanMutation.isPending}
                  onClick={() => createPlanMutation.mutate(planTaskId ?? undefined)}
                >
                  {createPlanMutation.isPending ? (
                    <Spinner data-icon="inline-start" aria-hidden="true" />
                  ) : null}
                  {createPlanMutation.isPending ? "正在创建..." : planTaskId ? "重试规划" : "生成初始讲稿"}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {approvalMutation.isError ? (
        <div className="px-4 pb-4 sm:px-6 lg:px-8">
          <Alert variant="destructive" role="alert">
            <AlertTitle>无法批准当前讲稿</AlertTitle>
            <AlertDescription>
              {getUserFacingErrorMessage(
                approvalMutation.error,
                "批准失败，请刷新当前页面后重试。",
              )}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

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
