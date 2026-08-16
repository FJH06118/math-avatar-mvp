import { ProviderProfileCreateInputSchema } from "@ppt-digital-human/contracts";
import { bffInvalidRequestResponse } from "@/lib/api/tracer-bff";
import { proxyProviderRequest } from "@/lib/api/provider-bff";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return proxyProviderRequest("/v1/providers", "GET", "provider-list");
}

export async function POST(request: Request): Promise<Response> {
  const parsed = ProviderProfileCreateInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bffInvalidRequestResponse("Provider Profile 请求不合法。");
  return proxyProviderRequest("/v1/providers", "POST", "provider", parsed.data);
}
