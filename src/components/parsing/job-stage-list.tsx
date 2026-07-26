import {
  CheckIcon,
  CircleIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import type { JobStage } from "@/types";

function StageIcon({ status }: { status: JobStage["status"] }) {
  if (status === "completed") {
    return <CheckIcon aria-hidden="true" />;
  }
  if (status === "running") {
    return <LoaderCircleIcon aria-hidden="true" className="animate-spin" />;
  }
  if (status === "failed") {
    return <XIcon aria-hidden="true" />;
  }
  return <CircleIcon aria-hidden="true" />;
}

export function JobStageList({ stages }: { stages: JobStage[] }) {
  return (
    <ItemGroup>
      {stages.map((stage) => (
        <Item
          key={stage.id}
          variant={stage.status === "running" ? "muted" : "default"}
          className="sm:flex-nowrap"
        >
          <ItemMedia
            variant="icon"
            className={
              stage.status === "failed"
                ? "text-destructive"
                : stage.status === "pending"
                  ? "text-muted-foreground"
                  : "text-primary"
            }
          >
            <StageIcon status={stage.status} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{stage.label}</ItemTitle>
            <ItemDescription>{stage.description}</ItemDescription>
          </ItemContent>
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
        </Item>
      ))}
    </ItemGroup>
  );
}
