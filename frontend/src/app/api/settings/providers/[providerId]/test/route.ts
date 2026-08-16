import { ProviderTestRequestSchema, StableIdSchema } from "@ppt-digital-human/contracts";
import { bffInvalidRequestResponse } from "@/lib/api/tracer-bff";
import { proxyProviderRequest } from "@/lib/api/provider-bff";

export async function POST(
  request: Request,
  context: { params: Promise<{ providerId: string }> },
): Promise<Response> {
  const { providerId } = await context.params;
  if (!StableIdSchema.safeParse(providerId).success) return bffInvalidRequestResponse("Provider ID 不合法。");
  const parsed = ProviderTestRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bffInvalidRequestResponse("Provider 测试请求不合法。");
  return proxyProviderRequest(`/v1/providers/${encodeURIComponent(providerId)}/test`, "POST", "provider-test", parsed.data);
}
