import type { Metadata } from "next";

import { WorkflowFrame } from "@/components/layout/workflow-frame";
import { UploadFlow } from "@/components/upload/upload-flow";

export const metadata: Metadata = {
  title: "上传课件",
};

export default function UploadPage() {
  return (
    <WorkflowFrame
      currentStep={0}
      title="上传课程课件"
      description="系统会逐页提取内容、识别数学公式，并准备可编辑的初始讲稿。"
      backHref="/"
      backLabel="返回项目列表"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(15rem,0.4fr)_minmax(0,1fr)] lg:gap-12">
        <aside className="flex flex-col gap-6 lg:border-r lg:border-foreground/15 lg:pr-10">
          <div>
            <h2 className="text-base font-semibold">上传前确认</h2>
            <p className="mt-1 text-base text-muted-foreground sm:text-sm">
              请使用内容完整、可正常打开的源课件。
            </p>
          </div>
          <dl className="divide-y divide-foreground/12 border-y border-foreground/12">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-muted-foreground">支持格式</dt>
              <dd className="font-medium">PPT、PPTX</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-muted-foreground">文件大小</dt>
              <dd className="font-medium">不超过 100 MB</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-muted-foreground">处理内容</dt>
              <dd className="font-medium">页面、文字、公式</dd>
            </div>
          </dl>
          <p className="text-base text-muted-foreground sm:text-sm">
            上传完成后会自动进入解析页，原文件不会被修改。
          </p>
        </aside>
        <div className="min-w-0">
          <UploadFlow />
        </div>
      </div>
    </WorkflowFrame>
  );
}
