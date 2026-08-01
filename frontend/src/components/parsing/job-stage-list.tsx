import {
  CheckIcon,
  CircleIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobStage } from "@/types";

function StageIcon({ status }: { status: JobStage["status"] }) {
  if (status === "completed") {
    return <CheckIcon aria-hidden="true" />;
  }
  if (status === "running") {
    return (
      <LoaderCircleIcon
        aria-hidden="true"
        className="animate-spin motion-reduce:animate-pulse"
      />
    );
  }
  if (status === "failed") {
    return <XIcon aria-hidden="true" />;
  }
  return <CircleIcon aria-hidden="true" />;
}

export function JobStageList({ stages }: { stages: JobStage[] }) {
  return (
    <ol className="divide-y divide-foreground/12 border-y border-foreground/15">
      {stages.map((stage) => (
        <li
          key={stage.id}
          className={cn(
            "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 py-4",
            stage.status === "running" && "text-foreground",
          )}
        >
          <span
            className={
              stage.status === "failed"
                ? "text-destructive"
                : stage.status === "pending"
                  ? "text-muted-foreground"
                  : "text-primary"
            }
          >
            <StageIcon status={stage.status} />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{stage.label}</p>
            <p className="mt-0.5 text-base text-muted-foreground sm:text-sm">
              {stage.description}
            </p>
          </div>
          <Badge
            variant={
              stage.status === "failed"
                ? "destructive"
                : stage.status === "running"
                  ? "secondary"
                  : "outline"
            }
          >
            {stage.status === "completed"
              ? "已完成"
              : stage.status === "running"
                ? `${stage.progress}%`
                : stage.status === "failed"
                  ? "失败"
              : "等待中"}
          </Badge>
        </li>
      ))}
    </ol>
  );
}
