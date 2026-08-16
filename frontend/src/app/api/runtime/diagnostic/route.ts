import { proxyRuntimeRequest } from "@/lib/api/runtime-bff";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return proxyRuntimeRequest("/v1/runtime/diagnostic", "runtime-diagnostic");
}
