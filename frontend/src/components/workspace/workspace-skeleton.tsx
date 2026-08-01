import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceSkeleton() {
  return (
    <div aria-label="正在加载项目工作台" aria-busy="true">
      <div className="flex flex-col gap-5 border-b bg-card px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Skeleton className="h-8 w-28" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
          </div>
          <Skeleton className="hidden h-8 w-32 sm:block" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="grid min-h-[34rem] gap-1 p-4 sm:p-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:p-8 xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        <Skeleton className="h-56 rounded-md lg:h-[34rem]" />
        <Skeleton className="h-[34rem] rounded-md" />
        <Skeleton className="h-[28rem] rounded-md lg:col-span-2 xl:col-span-1 xl:h-[34rem]" />
      </div>
    </div>
  );
}
