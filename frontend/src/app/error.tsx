"use client";

import { HomeIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <PageContainer className="flex flex-1 items-center justify-center py-14">
      <section
        className="product-surface flex max-w-lg flex-col items-center gap-4 rounded-lg p-6 text-center sm:p-8"
        role="alert"
        aria-labelledby="route-error-title"
      >
        <h1
          ref={headingRef}
          id="route-error-title"
          tabIndex={-1}
          className="text-2xl font-semibold outline-none"
        >
          当前页面未能正常加载
        </h1>
        <p className="text-pretty text-muted-foreground">
          页面内容没有丢失。请重新加载；如果问题仍然存在，可以先返回项目列表。
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={reset}>
            <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
            重新加载页面
          </Button>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <HomeIcon data-icon="inline-start" aria-hidden="true" />
            返回项目列表
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
