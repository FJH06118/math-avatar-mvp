import {
  ProviderProfileDeleteInputSchema,
  ProviderProfileUpdateInputSchema,
  StableIdSchema,
} from "@ppt-digital-human/contracts";
import { bffInvalidRequestResponse } from "@/lib/api/tracer-bff";
import { proxyProviderRequest } from "@/lib/api/provider-bff";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ providerId: string }> },
): Promise<Response> {
  const { providerId } = await context.params;
  if (!StableIdSchema.safeParse(providerId).success) return bffInvalidRequestResponse("Provider ID 不合法。");
  const parsed = ProviderProfileUpdateInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bffInvalidRequestResponse("Provider Profile 更新请求不合法。");
  return proxyProviderRequest(`/v1/providers/${encodeURIComponent(providerId)}`, "PATCH", "provider", parsed.data);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ providerId: string }> },
): Promise<Response> {
  const { providerId } = await context.params;
  if (!StableIdSchema.safeParse(providerId).success) return bffInvalidRequestResponse("Provider ID 不合法。");
  const parsed = ProviderProfileDeleteInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bffInvalidRequestResponse("Provider Profile 删除请求不合法。");
  return proxyProviderRequest(`/v1/providers/${encodeURIComponent(providerId)}`, "DELETE", "provider", parsed.data);
}
