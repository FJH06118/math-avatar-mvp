"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, KeyRoundIcon, PlusIcon, ShieldCheckIcon, TestTube2Icon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/error-state";
import { getUserFacingErrorMessage } from "@/lib/api";
import {
  createProviderProfile,
  getApplicationSettings,
  setDefaultProvider,
  testProviderProfile,
  updateProviderProfile,
} from "@/lib/api/provider-client";
import type { ProviderKind, ProviderProfile, ProviderTestResult } from "@ppt-digital-human/contracts";

interface ProviderSettingsPanelProps {
  setupMode?: boolean;
}

interface ProviderFormState {
  displayName: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  isDefault: boolean;
}

const DEFAULT_FORM: ProviderFormState = {
  displayName: "",
  kind: "DEEPSEEK",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  apiKey: "",
  enabled: true,
  isDefault: true,
};

const PROVIDER_LABELS: Record<ProviderKind, string> = {
  OPENAI: "OpenAI 兼容",
  DEEPSEEK: "DeepSeek",
  GLM: "智谱 GLM",
  KIMI: "Kimi",
  ANTHROPIC: "Anthropic",
};

export function ProviderSettingsPanel({ setupMode = false }: ProviderSettingsPanelProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderFormState>(DEFAULT_FORM);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["application-settings"],
    queryFn: ({ signal }) => getApplicationSettings(signal),
    staleTime: 0,
  });
  const providers = settingsQuery.data?.providers ?? [];
  const selectedProvider = providers.find((provider) => provider.id === selectedId) ?? null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const protocol = form.kind === "ANTHROPIC" ? "ANTHROPIC_MESSAGES" : "OPENAI_CHAT";
      if (selectedProvider) {
        return updateProviderProfile(selectedProvider.id, {
          expectedVersion: selectedProvider.version,
          displayName: form.displayName.trim(),
          kind: form.kind,
          protocol,
          baseUrl: form.baseUrl.trim(),
          model: form.model.trim(),
          enabled: form.enabled,
          isDefault: form.isDefault,
          ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        });
      }
      return createProviderProfile({
        displayName: form.displayName.trim(),
        kind: form.kind,
        protocol,
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        enabled: form.enabled,
        isDefault: form.isDefault || providers.length === 0,
        apiKey: form.apiKey.trim(),
      });
    },
    onSuccess: async (provider) => {
      setFeedback(selectedProvider ? "Provider 设置已保存；如填写新密钥，密钥版本已轮换。" : "Provider 已保存。请先执行连接测试。" );
      setSelectedId(provider.id);
      setForm(providerToForm(provider));
      setTestResult(null);
      await queryClient.invalidateQueries({ queryKey: ["application-settings"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (provider: ProviderProfile) => testProviderProfile(provider.id, provider.version),
    onSuccess: async (result) => {
      setTestResult(result);
      setFeedback(null);
      await queryClient.invalidateQueries({ queryKey: ["application-settings"] });
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (provider: ProviderProfile) => setDefaultProvider(provider.id, provider.version),
    onSuccess: async (provider) => {
      setFeedback(`${provider.displayName} 已设为默认 Provider。`);
      await queryClient.invalidateQueries({ queryKey: ["application-settings"] });
    },
  });

  const isBusy = saveMutation.isPending || testMutation.isPending || defaultMutation.isPending;
  const selectedSummary = useMemo(
    () => selectedProvider ? `${PROVIDER_LABELS[selectedProvider.kind]} · ${selectedProvider.model}` : "新建 Provider",
    [selectedProvider],
  );

  function selectProvider(provider: ProviderProfile) {
    setSelectedId(provider.id);
    setForm(providerToForm(provider));
    setFeedback(null);
    setTestResult(null);
  }

  function startNew() {
    setSelectedId(null);
    setForm({ ...DEFAULT_FORM, isDefault: providers.length === 0 });
    setFeedback(null);
    setTestResult(null);
  }

  function updateForm<K extends keyof ProviderFormState>(key: K, value: ProviderFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  if (settingsQuery.isPending) {
    return <div className="rounded-lg border border-foreground/12 bg-card p-6 text-sm text-muted-foreground" role="status">正在读取 Provider 设置…</div>;
  }
  if (settingsQuery.isError) {
    return <ErrorState title="无法读取 Provider 设置" description={getUserFacingErrorMessage(settingsQuery.error, "请检查本地运行时后重试。")} onRetry={() => void settingsQuery.refetch()} isRetrying={settingsQuery.isFetching} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {setupMode ? (
        <Alert>
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>先配置一个可用的默认 Provider</AlertTitle>
          <AlertDescription>没有通过真实连接测试的 Provider 时，系统会阻止课件上传，避免进入无法完成的生成流程。</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-foreground/12 bg-card p-5" aria-labelledby="provider-list-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="provider-list-title" className="text-lg font-semibold">Provider Profiles</h2>
              <p className="mt-1 text-sm text-muted-foreground">密钥只进入桌面主进程的 Windows 安全存储，页面只显示配置状态和尾四位。</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={startNew} disabled={isBusy}>
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              新建
            </Button>
          </div>
          <div className="flex flex-col gap-2" role="list" aria-label="Provider 列表">
            {providers.length === 0 ? (
              <p className="rounded-md border border-dashed border-foreground/20 px-4 py-6 text-sm text-muted-foreground">还没有 Provider。请在右侧保存一个配置。</p>
            ) : providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                role="listitem"
                aria-current={provider.id === selectedId ? "true" : undefined}
                onClick={() => selectProvider(provider)}
                className={`flex w-full flex-col gap-2 rounded-md border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40 ${provider.id === selectedId ? "border-primary/60 bg-primary/6" : "border-foreground/12 hover:bg-foreground/[0.04]"}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">{provider.displayName}</span>
                  <span className="flex items-center gap-1.5">
                    {provider.isDefault ? <Badge variant="secondary">默认</Badge> : null}
                    <Badge variant={provider.lastTestAt ? "outline" : provider.enabled && provider.keyConfigured ? "secondary" : "destructive"}>{provider.lastTestAt ? "已连接" : provider.enabled && provider.keyConfigured ? "待测试" : "待处理"}</Badge>
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">{PROVIDER_LABELS[provider.kind]} · {provider.model}</span>
                <span className="text-xs text-muted-foreground">密钥版本 {provider.keyVersion} · {provider.keyConfigured ? `尾号 ${provider.keyLast4 ?? "未记录"}` : "未配置"}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-5 rounded-lg border border-foreground/12 bg-card p-5" aria-labelledby="provider-form-title">
          <div>
            <h2 id="provider-form-title" className="text-lg font-semibold">{selectedSummary}</h2>
            <p className="mt-1 text-sm text-muted-foreground">留空 API Key 表示保留当前密钥；填写新值会创建新的密钥版本。</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium">显示名称<input value={form.displayName} onChange={(event) => updateForm("displayName", event.target.value)} className="h-10 rounded-md border border-input bg-transparent px-3 font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/40" autoComplete="off" /></label>
            <label className="flex flex-col gap-2 text-sm font-medium">Provider 类型<select value={form.kind} onChange={(event) => updateForm("kind", event.target.value as ProviderKind)} className="h-10 rounded-md border border-input bg-transparent px-3 font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/40">{Object.entries(PROVIDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">API 地址<input value={form.baseUrl} onChange={(event) => updateForm("baseUrl", event.target.value)} className="h-10 rounded-md border border-input bg-transparent px-3 font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/40" inputMode="url" autoComplete="url" /></label>
            <label className="flex flex-col gap-2 text-sm font-medium">模型<input value={form.model} onChange={(event) => updateForm("model", event.target.value)} className="h-10 rounded-md border border-input bg-transparent px-3 font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/40" autoComplete="off" /></label>
            <label className="flex flex-col gap-2 text-sm font-medium">API Key<input type="password" value={form.apiKey} onChange={(event) => updateForm("apiKey", event.target.value)} className="h-10 rounded-md border border-input bg-transparent px-3 font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/40" autoComplete="new-password" placeholder={selectedProvider?.keyConfigured ? "已配置，留空保持不变" : "粘贴新的 API Key"} /></label>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={(event) => updateForm("enabled", event.target.checked)} />启用此 Provider</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.isDefault} onChange={(event) => updateForm("isDefault", event.target.checked)} />设为默认 Provider</label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={isBusy || !form.displayName.trim() || !form.baseUrl.trim() || !form.model.trim() || (!selectedProvider && !form.apiKey.trim())}>
              {saveMutation.isPending ? "保存中…" : "保存设置"}
            </Button>
            {selectedProvider ? <Button type="button" variant="outline" onClick={() => testMutation.mutate(selectedProvider)} disabled={isBusy || !selectedProvider.enabled || !selectedProvider.keyConfigured}><TestTube2Icon data-icon="inline-start" aria-hidden="true" />{testMutation.isPending ? "测试中…" : "连接测试"}</Button> : null}
            {selectedProvider && !selectedProvider.isDefault ? <Button type="button" variant="outline" onClick={() => defaultMutation.mutate(selectedProvider)} disabled={isBusy || !selectedProvider.enabled || !selectedProvider.keyConfigured}>设为默认</Button> : null}
          </div>
          {testResult ? <Alert variant={testResult.status === "CONNECTED" ? undefined : "destructive"}><TestTube2Icon aria-hidden="true" /><AlertTitle>{testResult.status === "CONNECTED" ? "真实连接测试通过" : "连接测试未通过"}</AlertTitle><AlertDescription>{testResult.status === "CONNECTED" ? `模型 ${testResult.model} 已实际响应，延迟 ${testResult.latencyMs ?? "—"} ms。` : testResultMessage(testResult)}</AlertDescription></Alert> : null}
          {testMutation.isError ? <Alert variant="destructive" role="alert"><TestTube2Icon aria-hidden="true" /><AlertTitle>连接测试请求失败</AlertTitle><AlertDescription>{getUserFacingErrorMessage(testMutation.error, "本地服务暂时无法执行连接测试，请重启桌面软件后重试。")}</AlertDescription></Alert> : null}
          {feedback ? <Alert><CheckCircle2Icon aria-hidden="true" /><AlertTitle>设置状态</AlertTitle><AlertDescription>{feedback}</AlertDescription></Alert> : null}
          <div className="flex flex-col gap-2 border-t border-foreground/12 pt-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><KeyRoundIcon className="size-4" aria-hidden="true" />密钥轮换不会把原密钥回显到页面、日志、任务或诊断报告。</p>
            <p>连接测试会向所选模型发送一条极短请求，用于核验地址、模型、密钥与网络；Provider 可能产生极少量用量。</p>
            <p>Edge TTS 是内置的音频路径。保存 Provider 后，进入课程工作台的“授课配置”即可试听实际音色和语速。</p>
            <Link href="/" className="text-primary underline-offset-4 hover:underline">打开课程列表，进入工作台试听 Edge TTS</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function providerToForm(provider: ProviderProfile): ProviderFormState {
  return {
    displayName: provider.displayName,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: "",
    enabled: provider.enabled,
    isDefault: provider.isDefault,
  };
}

function testResultMessage(result: ProviderTestResult): string {
  switch (result.errorCode) {
    case "CREDENTIAL_NOT_CONFIGURED": return "密钥尚未配置或已不可用，请重新填写 API Key 并保存。";
    case "SECRET_STORE_UNAVAILABLE": return "Windows 安全密钥存储暂时不可用，请重启桌面软件后重试。";
    case "PROFILE_DISABLED": return "该 Provider 已停用，请先启用后再测试。";
    case "PROVIDER_AUTH_FAILED": return "Provider 拒绝了密钥，请重新填写 API Key、保存后再次测试。";
    case "PROVIDER_RATE_LIMITED": return "Provider 当前限流，请稍后重新测试连接。";
    case "PROVIDER_UPSTREAM_FAILED": return "Provider 上游服务暂时不可用，请稍后重新测试连接。";
    case "PROVIDER_REQUEST_REJECTED": return "Provider 拒绝了请求，请检查 API 地址和模型名称后重新测试。";
    case "PROVIDER_TIMEOUT": return "Provider 请求超时，请检查网络或代理后重新测试连接。";
    case "PROVIDER_CONNECTION_FAILED": return "无法连接 Provider，请检查网络、代理和 API 地址后重新测试。";
    case "PROVIDER_RESPONSE_INVALID": return "Provider 返回了无法识别的响应，请检查地址、协议和模型兼容性。";
    default: return "连接测试未完成，请检查 Provider 设置并重新测试；若持续失败，请重启桌面软件。";
  }
}
