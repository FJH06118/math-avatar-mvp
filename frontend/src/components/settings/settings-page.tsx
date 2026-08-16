import { PageContainer } from "@/components/layout/page-container";

import { ProviderSettingsPanel } from "./provider-settings-panel";
import { RuntimeHealthPanel } from "../runtime-health/runtime-health-panel";

export function SettingsPage() {
  return <PageContainer size="wide" className="flex flex-col gap-8 py-8 sm:py-10">
    <header className="max-w-3xl">
      <p className="text-sm font-medium text-primary">系统设置</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em]">Provider、声音与本地运行时</h1>
      <p className="mt-3 text-base text-muted-foreground">在这里完成密钥轮换、连接测试、首次运行检查和诊断导出。项目内的授课设置仍以最终生成快照为准。</p>
    </header>
    <ProviderSettingsPanel />
    <RuntimeHealthPanel />
  </PageContainer>;
}
