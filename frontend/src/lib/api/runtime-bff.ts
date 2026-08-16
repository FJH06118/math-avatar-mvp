import { bffErrorResponse, getApplicationConfig, parseApplicationResponse } from "./tracer-bff";

type RuntimeResponseKind = "runtime-health" | "runtime-diagnostic";

export async function proxyRuntimeRequest(
  path: "/v1/runtime/health" | "/v1/runtime/diagnostic",
  kind: RuntimeResponseKind,
): Promise<Response> {
  try {
    const config = getApplicationConfig();
    const upstream = await fetch(`${config.baseUrl}${path}`, {
      headers: {
        accept: "application/json",
        "X-Internal-Token": config.internalToken,
        "X-Principal": config.principal,
      },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const parsed = await parseApplicationResponse(upstream, kind);
    return Response.json(parsed, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}
