import { Spinner } from "@/components/ui/spinner";

interface LoadingStateProps {
  title?: string;
  description?: string;
}

export function LoadingState({
  title = "正在加载",
  description = "请稍候，正在准备所需内容。",
}: LoadingStateProps) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-background p-6 text-center"
      role="status"
      aria-live="polite"
    >
      <Spinner className="text-primary" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
