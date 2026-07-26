import { Skeleton } from "@/components/ui/skeleton";

export function ProjectListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="正在加载最近项目">
      {[0, 1].map((item) => (
        <div
          key={item}
          className="flex items-center gap-4 rounded-xl border bg-card p-4"
        >
          <Skeleton className="size-10 shrink-0 rounded-lg" />
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
