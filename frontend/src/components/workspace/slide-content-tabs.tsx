import {
  FileTextIcon,
  MessageSquareTextIcon,
  PresentationIcon,
  SigmaIcon,
  LockIcon,
  LockOpenIcon,
  CheckCircle2Icon,
} from "lucide-react";

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { Avatar, ParsedSlide } from "@/types";

import { FormulaList } from "./formula-list";
import { SlidePreview } from "./slide-preview";

interface SlideContentTabsProps {
  slide: ParsedSlide;
  displayText: string;
  spokenText: string;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onDisplayTextChange: (value: string) => void;
  onSpokenTextChange: (value: string) => void;
  onLockChange?: (locked: boolean) => void;
  isLocking?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
  avatar?: Avatar;
  avatarPosition?: "left" | "right" | "hidden";
}

export type WorkspaceTab =
  | "preview"
  | "content"
  | "script"
  | "formulas";

const reviewFlagLabels: Record<string, string> = {
  LOW_CONFIDENCE: "解析置信度偏低",
  PARSE_WARNING: "存在解析警告",
  FORMULA_REVIEW: "公式需要确认",
  HIGH_RISK_DERIVATION: "推导风险较高",
};

export function SlideContentTabs({
  slide,
  displayText,
  spokenText,
  activeTab,
  onTabChange,
  onDisplayTextChange,
  onSpokenTextChange,
  onLockChange,
  isLocking = false,
  onApprove,
  isApproving = false,
  avatar,
  avatarPosition,
}: SlideContentTabsProps) {
  return (
    <section className="min-w-0 border-b border-foreground/15 bg-card p-4 sm:p-6 xl:border-r xl:border-b-0">
      {slide.lessonPlanRevisionId ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-foreground/10 pb-4">
          <Badge variant={slide.lessonPlanApproval === "approved" ? "secondary" : "outline"}>
            {slide.lessonPlanApproval === "approved" ? "已批准" : "待批准"}
          </Badge>
          <Badge variant="outline">
            {slide.preservationMode === "FULL_PRESERVE"
              ? "完整保留原页"
              : slide.preservationMode === "PRESERVE_WITH_OVERLAY"
                ? "原页 + 增强标注"
                : slide.preservationMode === "LOCAL_REBUILD"
                  ? "局部重建"
                  : "整页重设计"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            修订 {slide.lessonPlanRevision} · {slide.sceneCount} 个分镜
          </span>
          {slide.lessonPlanRevisionId && slide.lessonPlanApproval !== "approved" && onApprove ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="ml-auto"
              disabled={isApproving || isLocking}
              onClick={onApprove}
            >
              {isApproving ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <CheckCircle2Icon data-icon="inline-start" aria-hidden="true" />
              )}
              {isApproving ? "正在批准…" : "批准本页讲稿"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={slide.lessonPlanApproval === "approved" ? "ml-auto" : undefined}
            disabled={isLocking || isApproving}
            onClick={() => onLockChange?.(!slide.isLocked)}
          >
            {slide.isLocked ? (
              <LockOpenIcon data-icon="inline-start" aria-hidden="true" />
            ) : (
              <LockIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {slide.isLocked ? "解锁本页" : "锁定本页"}
          </Button>
        </div>
      ) : null}
      {slide.lessonPlanApproval !== "approved" && slide.reviewFlags.length > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-950 dark:text-amber-100" role="alert">
          <p className="font-medium">本页必须人工复核后才能生成视频</p>
          <p className="mt-1">
            {slide.reviewFlags.map((flag) => reviewFlagLabels[flag] ?? flag).join("、")}。
            请修正朗读文本并确认公式或推导内容，再批准当前讲稿。
          </p>
        </div>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
          已切换到第 {slide.slideNumber} 页：{slide.title}
      </p>
      <Tabs
        value={activeTab}
        className="min-w-0"
        onValueChange={(value) => onTabChange(value as WorkspaceTab)}
      >
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList variant="line">
            <TabsTrigger value="preview">
              <PresentationIcon data-icon="inline-start" aria-hidden="true" />
              页面预览
            </TabsTrigger>
            <TabsTrigger value="content">
              <FileTextIcon data-icon="inline-start" aria-hidden="true" />
              解析内容
            </TabsTrigger>
            <TabsTrigger value="script">
              <MessageSquareTextIcon
                data-icon="inline-start"
                aria-hidden="true"
              />
              授课讲稿
            </TabsTrigger>
            <TabsTrigger value="formulas">
              <SigmaIcon data-icon="inline-start" aria-hidden="true" />
              公式检查
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="preview" className="pt-4">
          <SlidePreview
            slide={slide}
            avatar={avatar}
            avatarPosition={avatarPosition}
          />
        </TabsContent>

        <TabsContent value="content" className="pt-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">页面摘要</h2>
              <p className="text-pretty text-base text-muted-foreground sm:text-sm">
                {slide.summary}
              </p>
            </div>
            {slide.derivationSteps.length ? (
              <div className="flex flex-col gap-2">
                <h2 className="text-base font-semibold">推导步骤</h2>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  {slide.derivationSteps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">识别文本</h2>
              <p className="text-pretty text-base sm:text-sm">
                {slide.extractedText}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="script" className="pt-5">
          <div className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor={`display-text-${slide.id}`}>字幕显示文本</FieldLabel>
              <Textarea
                id={`display-text-${slide.id}`}
                name={`display-text-${slide.id}`}
                value={displayText}
                rows={8}
                className="min-h-48 resize-y"
                onChange={(event) => onDisplayTextChange(event.target.value)}
                disabled={slide.isLocked}
              />
              <FieldDescription>
                这段文字会进入中文字幕和字幕时间轴，可按页面版式调整断句。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`spoken-text-${slide.id}`}>朗读文本</FieldLabel>
              <Textarea
                id={`spoken-text-${slide.id}`}
                name={`spoken-text-${slide.id}`}
                value={spokenText}
                rows={10}
                className="min-h-64 resize-y"
                onChange={(event) => onSpokenTextChange(event.target.value)}
                disabled={slide.isLocked}
              />
              <FieldDescription>
                这段文字会送入 Edge TTS；公式页的中文公式读法可直接在这里修正，试听使用当前音色和语速。
              </FieldDescription>
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="formulas" className="pt-5">
          <FormulaList formulas={slide.formulas} />
          {slide.lessonPlanApproval !== "approved" && slide.reviewFlags.includes("FORMULA_REVIEW") ? (
            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              本页存在待确认公式。请在“朗读文本”中修正公式读法，并在确认后批准当前讲稿。
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
