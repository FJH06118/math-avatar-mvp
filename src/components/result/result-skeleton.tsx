import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export function ResultSkeleton() {
  return (
    <PageContainer
      size="wide"
      className="product-surface my-5 flex flex-col gap-8 rounded-lg p-5 sm:my-8 sm:p-10"
      aria-label="正在加载视频结果"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-[36rem] max-w-full" />
      </div>
      <div className="grid min-h-[28rem] gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Skeleton className="aspect-video w-full rounded-md" />
        <Skeleton className="h-80 rounded-md" />
      </div>
    </PageContainer>
  );
}
