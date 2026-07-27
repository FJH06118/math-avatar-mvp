import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const steps = ["上传课件", "解析内容", "编辑课程", "生成视频", "完成"] as const;

export function CourseProgress({ current }: { current: number }) {
  return (
    <ol
      className="grid w-full grid-cols-5 gap-1"
      aria-label="课程制作进度"
    >
      {steps.map((step, index) => {
        const isComplete = index < current;
        const isCurrent = index === current;

        return (
          <li
            key={step}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center"
            aria-current={isCurrent ? "step" : undefined}
          >
            <div className="flex w-full items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "h-px flex-1",
                  index === 0 ? "bg-transparent" : "bg-border",
                )}
              />
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border bg-card text-xs tabular-nums",
                  isComplete &&
                    "border-primary bg-primary text-primary-foreground",
                  isCurrent &&
                    "border-primary bg-primary/10 font-medium text-primary",
                  !isComplete &&
                    !isCurrent &&
                    "border-border text-muted-foreground",
                )}
              >
                {isComplete ? (
                  <CheckIcon aria-hidden="true" className="size-3" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "h-px flex-1",
                  index === steps.length - 1
                    ? "bg-transparent"
                    : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "hidden truncate text-xs sm:block",
                isCurrent
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {step}
            </span>
            <span className="sr-only sm:hidden">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
