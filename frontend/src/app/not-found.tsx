import { HomeIcon } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFoundPage() {
  return (
    <PageContainer className="flex flex-1 items-center justify-center py-14">
      <section className="product-surface flex max-w-lg flex-col items-center gap-4 rounded-lg p-6 text-center sm:p-8">
        <p className="font-medium text-primary">404</p>
        <h1 className="text-2xl font-semibold">没有找到这个页面</h1>
        <p className="text-pretty text-muted-foreground">
          链接可能已失效，或项目已经被删除。请返回项目列表继续操作。
        </p>
        <Link href="/" className={cn(buttonVariants())}>
          <HomeIcon data-icon="inline-start" aria-hidden="true" />
          返回项目列表
        </Link>
      </section>
    </PageContainer>
  );
}
