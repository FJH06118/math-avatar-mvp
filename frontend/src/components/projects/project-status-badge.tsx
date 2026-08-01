import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { ProjectStatus } from "@/types";

const labels: Record<ProjectStatus, string> = {
  draft: "草稿",
  uploading: "上传中",
  parsing: "解析中",
  ready: "待生成",
  rendering: "生成中",
  completed: "已完成",
  failed: "需处理",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const isBusy = ["uploading", "parsing", "rendering"].includes(status);
  const variant =
    status === "failed"
      ? "destructive"
      : status === "completed"
        ? "default"
        : "secondary";

  return (
    <Badge variant={variant}>
      {isBusy ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
      {labels[status]}
    </Badge>
  );
}
