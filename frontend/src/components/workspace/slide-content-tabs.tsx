import {
  FileTextIcon,
  MessageSquareTextIcon,
  PresentationIcon,
  SigmaIcon,
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
import type { ParsedSlide } from "@/types";

import { FormulaList } from "./formula-list";
import { SlidePreview } from "./slide-preview";

interface SlideContentTabsProps {
  slide: ParsedSlide;
  scriptValue: string;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onScriptChange: (value: string) => void;
}

export type WorkspaceTab =
  | "preview"
  | "content"
  | "script"
  | "formulas";

export function SlideContentTabs({
  slide,
  scriptValue,
  activeTab,
  onTabChange,
  onScriptChange,
}: SlideContentTabsProps) {
  return (
    <section className="min-w-0 border-b border-foreground/15 bg-card p-4 sm:p-6 xl:border-r xl:border-b-0">
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
          <SlidePreview slide={slide} />
        </TabsContent>

        <TabsContent value="content" className="pt-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">页面摘要</h2>
              <p className="text-pretty text-base text-muted-foreground sm:text-sm">
                {slide.summary}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">识别文本</h2>
              <p className="text-pretty text-base sm:text-sm">
                {slide.extractedText}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="script" className="pt-5">
          <Field>
            <FieldLabel htmlFor={`script-${slide.id}`}>本页授课讲稿</FieldLabel>
            <Textarea
              id={`script-${slide.id}`}
              name={`script-${slide.id}`}
              value={scriptValue}
              rows={10}
              className="min-h-64 resize-y"
              onChange={(event) => onScriptChange(event.target.value)}
            />
            <FieldDescription>
              修改会自动保存。建议保留自然停顿，并先解释符号再朗读公式。
            </FieldDescription>
          </Field>
        </TabsContent>

        <TabsContent value="formulas" className="pt-5">
          <FormulaList formulas={slide.formulas} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
