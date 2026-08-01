import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ProjectListSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="divide-y divide-foreground/12 border-y border-foreground/15"
      aria-label="正在加载最近项目"
    >
      {[0, 1].map((item) => (
        <div
          key={item}
          className={cn(
            "flex items-center gap-4",
            compact ? "py-3" : "py-5",
          )}
        >
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-8 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}
