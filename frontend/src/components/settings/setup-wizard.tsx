import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ProviderSettingsPanel } from "./provider-settings-panel";
import { RuntimeHealthPanel } from "../runtime-health/runtime-health-panel";

export function SetupWizard() {
  return <PageContainer size="wide" className="flex flex-col gap-8 py-8 sm:py-10">
    <header className="max-w-3xl">
      <p className="text-sm font-medium text-primary">首次启动</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em]">先把本地授课环境准备好</h1>
      <p className="mt-3 text-base text-muted-foreground">完成 Provider 配置和连接测试后，系统才会允许上传课件。密钥保存在 Windows 安全存储中，不会进入浏览器、任务或诊断报告。</p>
    </header>
    <ProviderSettingsPanel setupMode />
    <RuntimeHealthPanel />
    <div className="flex flex-wrap gap-2">
      <Link href="/" className={cn(buttonVariants({ variant: "default" }))}>返回课程列表</Link>
      <Link href="/settings" className={cn(buttonVariants({ variant: "outline" }))}>打开完整设置</Link>
    </div>
  </PageContainer>;
}
