import { ArrowRightIcon, PresentationIcon } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ProjectList } from "./project-list";

export function ProjectHome() {
  return (
    <PageContainer className="flex flex-col gap-10 py-10 sm:py-14">
      <section
        className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end"
        aria-labelledby="home-title"
      >
        <div className="flex max-w-2xl flex-col gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PresentationIcon aria-hidden="true" className="size-5" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-primary">高等数学授课工作台</p>
            <h1
              id="home-title"
              className="text-2xl font-semibold tracking-tight sm:text-[28px]"
            >
              从课件到数字人授课视频
            </h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              上传课件，校对逐页讲稿与数学公式，生成带字幕的完整课程视频。
            </p>
          </div>
        </div>
        <Link href="/upload" className={cn(buttonVariants({ size: "lg" }))}>
          上传 PPT 创建课程
          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        </Link>
      </section>

      <section
        id="recent-projects"
        className="flex scroll-mt-24 flex-col gap-4"
        aria-labelledby="recent-projects-title"
      >
        <div className="flex flex-col gap-1">
          <h2 id="recent-projects-title" className="text-lg font-semibold">
            最近项目
          </h2>
          <p className="text-sm text-muted-foreground">
            继续编辑讲稿、调整授课配置或查看已生成的视频。
          </p>
        </div>
        <ProjectList />
      </section>
    </PageContainer>
  );
}
