"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="grid min-h-[calc(100dvh-4rem)] place-items-center px-4 py-10">
      <section role="alert" aria-labelledby="route-error-title" className="product-surface max-w-lg rounded-lg p-6 text-center sm:p-8">
        <h1 ref={headingRef} id="route-error-title" tabIndex={-1} className="text-xl font-semibold outline-none">
          当前页面暂时无法显示
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          请求可能暂时中断。已保存的项目、讲稿和生成任务不会受到影响。
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={reset}>重试当前页面</Button>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>返回项目列表</Link>
        </div>
      </section>
    </div>
  );
}
