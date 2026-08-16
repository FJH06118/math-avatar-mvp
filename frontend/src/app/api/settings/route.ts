import { proxyProviderRequest } from "@/lib/api/provider-bff";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return proxyProviderRequest("/v1/settings", "GET", "application-settings");
}
