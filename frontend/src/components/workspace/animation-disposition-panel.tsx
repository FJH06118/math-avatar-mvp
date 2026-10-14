"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  decideTracerAnimationDisposition,
  getTracerAnimationDisposition,
  getTracerLessonPlans,
  getUserFacingErrorMessage,
} from "@/lib/api";
import type {
  AnimationDispositionMode,
  SlideAnimationReview,
} from "@ppt-digital-human/contracts";

/** 支持等级的中文说明；与 packages/contracts 的 AnimationSupportLevelSchema 对应。 */
const SUPPORT_LEVEL_LABELS: Record<string, string> = {
  METADATA_SUPPORTED: "动画元数据可读取",
  REBUILD_WHITELIST: "属于可重建白名单",
  PRESERVE_NATIVE_RECOMMENDED: "建议保留原生播放",
  UNSUPPORTED_REQUIRES_REVIEW: "当前不受支持，需要复核",
  STATIC_FALLBACK: "动画元数据不可用",
};

const METADATA_SOURCE_LABELS: Record<string, string> = {
  POWERPOINT_COM: "已从 PowerPoint 读取",
  STATIC_FALLBACK: "未读取到动画元数据",
};

const SEQUENCE_KIND_LABELS: Record<string, string> = {
  MAIN: "主序列",
  INTERACTIVE: "交互序列",
};

const DISPOSITION_MODE_LABELS: Record<AnimationDispositionMode, string> = {
  NOT_APPLICABLE: "本页无动画",
  ACCEPT_STATIC: "已确认接受静态成片",
  PRESERVE_NATIVE: "保留原生动画",
};

/** 用户可主动选择的模式（服务端当前只开放接受静态）。 */
type SelectableDispositionMode = "ACCEPT_STATIC" | "PRESERVE_NATIVE";

/** 处置选择需要用户明确知晓的后果；措辞不得含糊。 */
export const ACCEPT_STATIC_COPY =
  "接受静态成片：最终视频不会播放本页动画，只会显示静态原页。";

export interface AnimationDispositionPanelProps {
  projectId: string;
  /**
   * 是否展示面板。Mock 模式下后端端点不可用，应传 false。
   * 处置选择必须落到"当前修订"上，因此面板自己会拉取当前讲稿修订。
   */
  enabled: boolean;
  /** 当前选中的页面；用于高亮。 */
  selectedSlideId?: string;
  onSelectSlide?: (slideId: string) => void;
}

export function AnimationDispositionPanel({
  projectId,
  enabled,
  selectedSlideId,
  onSelectSlide,
}: AnimationDispositionPanelProps) {
  const queryClient = useQueryClient();
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [openReasonFor, setOpenReasonFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reviewQuery = useQuery({
    queryKey: ["animation-disposition", projectId],
    queryFn: () => getTracerAnimationDisposition(projectId),
    enabled,
  });

  const revisionsQuery = useQuery({
    queryKey: ["lesson-plan-revisions", projectId],
    queryFn: () => getTracerLessonPlans(projectId),
    enabled,
  });

  const currentRevisions = useMemo(() => {
    const map: Record<string, { revisionId: string; revision: number }> = {};
    for (const revision of revisionsQuery.data ?? []) {
      map[revision.slideId] = { revisionId: revision.id, revision: revision.revision };
    }
    return map;
  }, [revisionsQuery.data]);

  const decision = useMutation({
    mutationFn: async (input: { slideId: string; mode: SelectableDispositionMode; reason: string }) => {
      const current = currentRevisions[input.slideId];
      if (!current) {
        throw new Error("找不到该页的当前修订，请刷新后重试。");
      }
      return decideTracerAnimationDisposition(current.revisionId, {
        expectedRevision: current.revision,
        mode: input.mode,
        ...(input.reason.trim() === "" ? {} : { reason: input.reason.trim() }),
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setOpenReasonFor(null);
      await queryClient.invalidateQueries({ queryKey: ["animation-disposition", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["lesson-plan-revisions", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
    },
    onError: (error: unknown) => {
      setActionError(getUserFacingErrorMessage(error, "动画处置提交失败，请重试。"));
    },
  });

  if (!enabled) return null;

  if (reviewQuery.isLoading) {
    return (
      <section className="rounded-lg border border-foreground/15 bg-card p-4 text-sm text-muted-foreground">
        正在读取动画信息…
      </section>
    );
  }
  if (reviewQuery.isError || !reviewQuery.data) {
    return (
      <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-medium">无法读取动画信息</p>
        <p className="mt-1 text-muted-foreground">
          {getUserFacingErrorMessage(reviewQuery.error, "请刷新页面后重试。")}
        </p>
      </section>
    );
  }

  const review = reviewQuery.data;
  const pending = new Set(review.pendingSlideIds);
  const animatedSlides = review.slides.filter((slide) => slide.hasAnimationFacts);

  return (
    <section className="rounded-lg border border-foreground/15 bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-2 border-b border-foreground/10 pb-3">
        <h2 className="text-base font-semibold">动画处置</h2>
        <Badge variant={pending.size > 0 ? "destructive" : "secondary"}>
          {pending.size > 0 ? `${pending.size} 页待选择` : "已全部处置"}
        </Badge>
        <Badge variant="outline">含动画页 {review.report.animatedSlideCount}</Badge>
        {review.report.metadataUnavailableSlideCount > 0 ? (
          <Badge variant="outline">
            动画元数据不可读 {review.report.metadataUnavailableSlideCount} 页
          </Badge>
        ) : null}
      </header>

      {pending.size > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-medium">含动画的页面必须先选择处置方式，否则无法生成视频</p>
          <p className="mt-1">{ACCEPT_STATIC_COPY}</p>
          <p className="mt-1 text-xs">
            选择后会创建一条新的待批准修订；仍需显式批准讲稿才能生成。
          </p>
        </div>
      ) : null}

      {actionError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      {animatedSlides.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          本课件没有检测到对象动画，无需逐页处置。
          {review.report.metadataUnavailableSlideCount > 0
            ? "注意：本课件未读取到动画元数据，因此无法确认页面是否含动画。"
            : ""}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {animatedSlides.map((slide) => (
            <li
              key={slide.slideId}
              className={`rounded-md border p-3 ${
                slide.slideId === selectedSlideId
                  ? "border-foreground/40 bg-muted/40"
                  : "border-foreground/15"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-sm font-medium underline-offset-2 hover:underline"
                  onClick={() => onSelectSlide?.(slide.slideId)}
                >
                  第 {slide.slideNumber} 页
                </button>
                <Badge variant="outline">{slide.effectCount} 个动画效果</Badge>
                {slide.sequenceKinds.map((kind) => (
                  <Badge key={kind} variant="outline">
                    {SEQUENCE_KIND_LABELS[kind] ?? kind}
                  </Badge>
                ))}
                <Badge variant={slide.dispositionCurrent ? "secondary" : "destructive"}>
                  {slide.dispositionCurrent && slide.disposition
                    ? DISPOSITION_MODE_LABELS[slide.disposition.mode]
                    : "尚未处置"}
                </Badge>
              </div>

              <SlideAnimationFacts slide={slide} />

              {pending.has(slide.slideId) ? (
                <div className="mt-3 space-y-2">
                  {openReasonFor === slide.slideId ? (
                    <div className="space-y-2">
                      <label
                        className="block text-xs font-medium"
                        htmlFor={`reason-${slide.slideId}`}
                      >
                        依据（必填，会记入该页修订）
                      </label>
                      <Textarea
                        id={`reason-${slide.slideId}`}
                        value={reasonDrafts[slide.slideId] ?? ""}
                        placeholder="例如：该页动画仅作装饰，静态原页已能完整表达教学内容。"
                        onChange={(event) =>
                          setReasonDrafts((current) => ({
                            ...current,
                            [slide.slideId]: event.target.value,
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">{ACCEPT_STATIC_COPY}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={
                            decision.isPending ||
                            (reasonDrafts[slide.slideId] ?? "").trim() === ""
                          }
                          onClick={() =>
                            decision.mutate({
                              slideId: slide.slideId,
                              mode: "ACCEPT_STATIC",
                              reason: reasonDrafts[slide.slideId] ?? "",
                            })
                          }
                        >
                          确认接受静态成片
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenReasonFor(null)}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decision.isPending}
                        onClick={() => setOpenReasonFor(slide.slideId)}
                      >
                        接受静态成片（本页动画不会播放）
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-4 border-t border-foreground/10 pt-3 text-xs text-muted-foreground">
        <p>
          生成结果统计：含动画 {review.report.animatedSlideCount} 页 · 保留原生{" "}
          {review.report.nativePreservedSlideCount} 页 · 明确静态{" "}
          {review.report.acceptedStaticSlideCount} 页 · 元数据不可读{" "}
          {review.report.metadataUnavailableSlideCount} 页
        </p>
        <p className="mt-1">
          当前可选处置方式：
          {review.selectableModes.map((mode) => DISPOSITION_MODE_LABELS[mode]).join("、")}
          （保留原生播放需等原生视频能力通过验证后才可选）
        </p>
      </footer>
    </section>
  );
}

function SlideAnimationFacts({ slide }: { slide: SlideAnimationReview }) {
  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      <p>
        元数据来源：{METADATA_SOURCE_LABELS[slide.metadataSource] ?? slide.metadataSource}
      </p>
      <p>支持评估：{slide.supportSummary}</p>
      <p>
        等级：
        {slide.supportLevels
          .map((level) => SUPPORT_LEVEL_LABELS[level] ?? level)
          .join("、")}
      </p>
      {slide.warnings.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {slide.warnings.map((warning, index) => (
            <li key={`${slide.slideId}-warning-${index}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
