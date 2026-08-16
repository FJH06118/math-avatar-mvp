import {
  ApiErrorSchema,
  ApplicationSettingsResponseSchema,
  ProviderProfileCreateInputSchema,
  ProviderProfileDeleteInputSchema,
  ProviderProfileListResponseSchema,
  ProviderProfileResponseSchema,
  ProviderProfileSetDefaultInputSchema,
  ProviderProfileUpdateInputSchema,
  ProviderTestRequestSchema,
  ProviderTestResponseSchema,
  type ProviderProfile,
  type ProviderProfileCreateInput,
  type ProviderProfileUpdateInput,
  type ProviderTestResult,
  type ApplicationSettings,
} from "@ppt-digital-human/contracts";
import { RealApiError } from "./real-tracer";

export async function getApplicationSettings(signal?: AbortSignal): Promise<ApplicationSettings> {
  const response = await fetch("/api/settings", { signal, cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throwProviderError(payload, "应用设置读取失败。");
  return ApplicationSettingsResponseSchema.parse(payload).data;
}

export function hasReadyDefaultProvider(settings: ApplicationSettings): boolean {
  const provider = settings.providers.find(
    (candidate) => candidate.id === settings.defaultProviderId,
  );
  return Boolean(provider?.enabled && provider.keyConfigured);
}

export async function assertReadyDefaultProvider(signal?: AbortSignal): Promise<ApplicationSettings> {
  const settings = await getApplicationSettings(signal);
  if (!hasReadyDefaultProvider(settings)) {
    throw new RealApiError(
      "请先在设置页配置并测试默认 Provider，再上传课件。",
      "PROVIDER_NOT_CONFIGURED",
      false,
    );
  }
  return settings;
}

export async function listProviderProfiles(signal?: AbortSignal): Promise<ProviderProfile[]> {
  const response = await fetch("/api/settings/providers", { signal, cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throwProviderError(body, "Provider 设置读取失败。");
  return ProviderProfileListResponseSchema.parse(body).data;
}

export async function createProviderProfile(input: ProviderProfileCreateInput, signal?: AbortSignal): Promise<ProviderProfile> {
  const body = ProviderProfileCreateInputSchema.parse(input);
  const response = await fetch("/api/settings/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throwProviderError(payload, "Provider 设置保存失败。");
  return ProviderProfileResponseSchema.parse(payload).data;
}

export async function updateProviderProfile(id: string, input: ProviderProfileUpdateInput, signal?: AbortSignal): Promise<ProviderProfile> {
  const body = ProviderProfileUpdateInputSchema.parse(input);
  const response = await fetch(`/api/settings/providers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throwProviderError(payload, "Provider 设置更新失败。");
  return ProviderProfileResponseSchema.parse(payload).data;
}

export async function deleteProviderProfile(id: string, expectedVersion: number, signal?: AbortSignal): Promise<void> {
  const body = ProviderProfileDeleteInputSchema.parse({ expectedVersion });
  const response = await fetch(`/api/settings/providers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throwProviderError(await response.json().catch(() => null), "Provider 设置删除失败。");
}

export async function setDefaultProvider(id: string, expectedVersion: number, signal?: AbortSignal): Promise<ProviderProfile> {
  const body = ProviderProfileSetDefaultInputSchema.parse({ expectedVersion });
  const response = await fetch(`/api/settings/providers/${encodeURIComponent(id)}/default`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throwProviderError(payload, "默认 Provider 设置失败。");
  return ProviderProfileResponseSchema.parse(payload).data;
}

export async function testProviderProfile(id: string, expectedVersion: number, signal?: AbortSignal): Promise<ProviderTestResult> {
  const body = ProviderTestRequestSchema.parse({ expectedVersion });
  const response = await fetch(`/api/settings/providers/${encodeURIComponent(id)}/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throwProviderError(payload, "Provider 连接测试失败。");
  return ProviderTestResponseSchema.parse(payload).data;
}

function throwProviderError(payload: unknown, fallback: string): never {
  const parsed = ApiErrorSchema.safeParse(payload);
  if (parsed.success) {
    throw new RealApiError(
      parsed.data.error.message,
      parsed.data.error.code,
      parsed.data.error.retryable,
    );
  }
  throw new RealApiError(fallback, "PROVIDER_REQUEST_FAILED", true);
}
