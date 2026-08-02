import { SigmaIcon } from "lucide-react";

import type { ParsedSlide } from "@/types";

export function SlidePreview({ slide }: { slide: ParsedSlide }) {
  return (
    <div className="overflow-hidden border border-foreground/20 bg-secondary/65 p-4 sm:p-8">
      <div className="mx-auto aspect-video w-full max-w-3xl bg-card p-5 shadow-[0_20px_50px_color-mix(in_oklch,var(--foreground)_14%,transparent)] ring-1 ring-foreground/10 sm:p-8">
        <div className="flex h-full flex-col justify-between gap-4">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-primary">
              高等数学 / 第 {slide.slideNumber} 页
            </p>
            <h2 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
              {slide.title}
            </h2>
            <p className="line-clamp-3 text-pretty text-base text-muted-foreground sm:text-sm">
              {slide.summary}
            </p>
          </div>
          {slide.formulas[0] ? (
            <div className="flex min-w-0 items-start gap-3 border-l-2 border-primary bg-secondary p-3 text-secondary-foreground">
              <SigmaIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
              />
              <p className="min-w-0 break-words font-mono text-sm">
                {slide.formulas[0].latex}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              本页用于概念讲解与例题分析。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
