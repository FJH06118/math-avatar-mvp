import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export function TaskFlowSkeleton({ title }: { title: string }) {
  return (
    <PageContainer className="flex flex-1 py-4 sm:py-6 lg:py-8" aria-label={title} aria-busy="true">
      <section className="product-surface my-auto flex min-h-[34rem] w-full flex-col gap-7 rounded-lg p-5 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-3 border-b border-foreground/12 pb-6">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <Skeleton className="h-7 w-52 max-w-full" />
          <Skeleton className="h-4 w-[32rem] max-w-full" />
        </div>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-7">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-2 w-full" />
          </div>
          <div className="divide-y divide-foreground/12 border-y border-foreground/15">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="grid grid-cols-[1.75rem_minmax(0,1fr)_4rem] items-center gap-3 py-4">
                <Skeleton className="size-5 rounded-full" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
