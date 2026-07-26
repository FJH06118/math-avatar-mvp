import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export function ResultSkeleton() {
  return (
    <PageContainer
      className="flex flex-col gap-8 py-10 sm:py-14"
      aria-label="正在加载视频结果"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-[36rem] max-w-full" />
      </div>
      <div className="grid min-h-[28rem] gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </PageContainer>
  );
}
