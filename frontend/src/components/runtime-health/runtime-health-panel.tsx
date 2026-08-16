"use client";

import { useQuery } from "@tanstack/react-query";
import { DownloadIcon, RefreshCwIcon, ServerCogIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/error-state";
import { downloadRuntimeDiagnostic, getRuntimeHealth, isDesktopHostAvailable, retryDesktopRuntime } from "@/lib/api/runtime-client";
import type { RuntimeHealthComponent, RuntimeHealthStatus } from "@ppt-digital-human/contracts";

const LABELS: Record<string, string> = {
  api: "业务 API",
  database: "数据库",
  provider: "默认 Provider",
  "edge-tts": "Edge TTS",
  "desktop-host": "桌面宿主",
  disk: "磁盘空间",
  "workflow-queue": "后台工作流",
};

export function RuntimeHealthPanel() {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryingRuntime, setRetryingRuntime] = useState(false);
  const healthQuery = useQuery({
    queryKey: ["runtime-health"],
    queryFn: ({ signal }) => getRuntimeHealth(signal),
    refetchInterval: 15_000,
  });

  if (healthQuery.isPending) {
    return <div className="rounded-lg border border-foreground/12 bg-card p-6 text-sm text-muted-foreground" role="status">正在检查本地运行时…</div>;
  }
  if (healthQuery.isError || !healthQuery.data) {
    return <ErrorState title="运行时健康检查失败" description={healthQuery.error instanceof Error ? healthQuery.error.message : "暂时无法读取本地组件状态。"} onRetry={() => void healthQuery.refetch()} isRetrying={healthQuery.isFetching} />;
  }

  const health = healthQuery.data;
  const desktopHostAvailable = isDesktopHostAvailable();
  async function retryRuntime() {
    setRetryError(null);
    setRetryingRuntime(true);
    try {
      await retryDesktopRuntime();
      await healthQuery.refetch();
    } catch (error: unknown) {
      setRetryError(error instanceof Error ? error.message : "桌面运行时重试失败。" );
    } finally {
      setRetryingRuntime(false);
    }
  }
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-foreground/12 bg-card p-5" aria-labelledby="runtime-health-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="runtime-health-title" className="flex items-center gap-2 text-lg font-semibold"><ServerCogIcon className="size-5 text-primary" aria-hidden="true" />运行时健康</h2>
          <p className="mt-1 text-sm text-muted-foreground">只展示脱敏状态、版本和可操作建议，不包含路径、密钥、Token 或数据库连接串。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void healthQuery.refetch()} disabled={healthQuery.isFetching}><RefreshCwIcon data-icon="inline-start" aria-hidden="true" />{healthQuery.isFetching ? "检查中…" : "重新检查"}</Button>
          {desktopHostAvailable && health.status !== "READY" ? <Button type="button" variant="outline" size="sm" onClick={() => void retryRuntime()} disabled={retryingRuntime}><RefreshCwIcon data-icon="inline-start" aria-hidden="true" />{retryingRuntime ? "重试中…" : "重试桌面运行时"}</Button> : null}
          <Button type="button" variant="outline" size="sm" onClick={() => { setDownloadError(null); void downloadRuntimeDiagnostic().catch((error: unknown) => setDownloadError(error instanceof Error ? error.message : "诊断报告导出失败。")); }}><DownloadIcon data-icon="inline-start" aria-hidden="true" />导出诊断</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={health.status === "READY" ? "secondary" : health.status === "FAILED" ? "destructive" : "outline"}>{healthStatusLabel(health.status)}</Badge>
        <span className="text-sm text-muted-foreground">模式：{health.mode === "production" ? "生产真实模式" : "开发 Mock 模式"} · 检查于 {formatTime(health.checkedAt)}</span>
      </div>
      {health.status === "NOT_CONFIGURED" ? <Alert><AlertTitle>完成首次设置后才能上传课件</AlertTitle><AlertDescription>请先配置默认 Provider 并通过连接测试。系统会在服务端再次拦截未配置的上传请求。</AlertDescription></Alert> : null}
      {downloadError ? <Alert variant="destructive"><AlertTitle>诊断报告导出失败</AlertTitle><AlertDescription>{downloadError}</AlertDescription></Alert> : null}
      {retryError ? <Alert variant="destructive"><AlertTitle>桌面运行时重试失败</AlertTitle><AlertDescription>{retryError}</AlertDescription></Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2" role="list" aria-label="运行时组件状态">
        {health.components.map((component) => <HealthComponent key={`${component.id}-${component.version ?? ""}`} component={component} />)}
      </div>
    </section>
  );
}

function HealthComponent({ component }: { component: RuntimeHealthComponent }) {
  const action = component.action;
  return <article className="flex min-w-0 flex-col gap-2 rounded-md border border-foreground/12 p-4" role="listitem">
    <div className="flex items-center justify-between gap-3"><h3 className="font-medium">{LABELS[component.id] ?? component.id}</h3><Badge variant={component.status === "READY" ? "secondary" : component.status === "FAILED" ? "destructive" : "outline"}>{healthStatusLabel(component.status)}</Badge></div>
    <p className="text-sm text-muted-foreground">{component.message}</p>
    {component.version ? <p className="text-xs text-muted-foreground">版本：{component.version}</p> : null}
    {component.latencyMs !== null ? <p className="text-xs text-muted-foreground">响应：{component.latencyMs} ms</p> : null}
    {action ? <p className="text-sm text-primary">建议：{action}</p> : null}
  </article>;
}

function healthStatusLabel(status: RuntimeHealthStatus): string {
  switch (status) {
    case "READY": return "正常";
    case "FAILED": return "故障";
    case "NOT_CONFIGURED": return "未配置";
    case "WARN": return "需关注";
    default: return "未知";
  }
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
