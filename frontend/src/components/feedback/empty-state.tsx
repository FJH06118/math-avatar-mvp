import { FolderOpenIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  icon?: LucideIcon;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  icon: Icon = FolderOpenIcon,
}: EmptyStateProps) {
  return (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {actionLabel && (actionHref || onAction) ? (
        <EmptyContent>
          {actionHref ? (
            <Link href={actionHref} className={cn(buttonVariants())}>
              {actionLabel}
            </Link>
          ) : (
            <Button type="button" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
