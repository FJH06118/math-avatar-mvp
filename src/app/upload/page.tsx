import type { Metadata } from "next";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { UploadFlow } from "@/components/upload/upload-flow";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "上传课件",
};

export default function UploadPage() {
  return (
    <PageContainer className="flex flex-col gap-8 py-10 sm:py-14">
      <div className="flex flex-col gap-5">
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "self-start",
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          返回项目列表
        </Link>
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-sm font-medium text-primary">第 1 步，共 5 步</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
            上传课程 PPT
          </h1>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            我们会模拟提取页面、识别文字和数学公式，并为每页生成可编辑的初始讲稿。
          </p>
        </div>
      </div>
      <UploadFlow />
    </PageContainer>
  );
}
