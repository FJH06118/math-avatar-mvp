import {
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
} from "@ppt-digital-human/contracts";

export async function listProviderProfiles(signal?: AbortSignal): Promise<ProviderProfile[]> {
  const response = await fetch("/api/settings/providers", { signal, cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error("Provider 设置读取失败。");
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
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("Provider 设置保存失败。");
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
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("Provider 设置更新失败。");
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
  if (!response.ok) throw new Error("Provider 设置删除失败。");
}

export async function setDefaultProvider(id: string, expectedVersion: number, signal?: AbortSignal): Promise<ProviderProfile> {
  const body = ProviderProfileSetDefaultInputSchema.parse({ expectedVersion });
  const response = await fetch(`/api/settings/providers/${encodeURIComponent(id)}/default`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("默认 Provider 设置失败。");
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
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("Provider 连接测试失败。");
  return ProviderTestResponseSchema.parse(payload).data;
}
