import { AlertCircleIcon, RotateCcwIcon } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorState({
  title = "加载失败",
  description = "暂时无法获取内容，请检查网络后重试。",
  retryLabel = "重新加载",
  onRetry,
  isRetrying = false,
}: ErrorStateProps) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRetrying}
            onClick={onRetry}
          >
            <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
            {isRetrying ? "重试中…" : retryLabel}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
