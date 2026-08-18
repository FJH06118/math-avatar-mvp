import {
  ApiErrorSchema,
  type ProviderProfileCreateInput,
  type ProviderProfileDeleteInput,
  type ProviderProfileSetDefaultInput,
  type ProviderProfileUpdateInput,
  type ProviderTestRequest,
} from "@ppt-digital-human/contracts";
import {
  bffErrorResponse,
  getApplicationConfig,
  parseApplicationResponse,
} from "./tracer-bff";

type ProviderResponseKind = "application-settings" | "provider-list" | "provider" | "provider-test";
type ProviderBody =
  | ProviderProfileCreateInput
  | ProviderProfileUpdateInput
  | ProviderProfileDeleteInput
  | ProviderProfileSetDefaultInput
  | ProviderTestRequest;

export async function proxyProviderRequest(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  kind: ProviderResponseKind,
  body?: ProviderBody,
): Promise<Response> {
  try {
    const config = getApplicationConfig();
    const upstream = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        "X-Internal-Token": config.internalToken,
        "X-Principal": config.principal,
      },
      body: body ? JSON.stringify(body) : undefined,
      // The backend probe has a 15-second timeout; the BFF must not abort first
      // or a Provider timeout would be misreported as a local service failure.
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (upstream.status === 204) return new Response(null, { status: 204 });
    const parsed = await parseApplicationResponse(upstream, kind);
    return Response.json(parsed, { status: upstream.status });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Provider upstream returned an invalid error response.") {
      return bffErrorResponse();
    }
    return bffErrorResponse();
  }
}

export function isApiErrorResponse(value: unknown): boolean {
  return ApiErrorSchema.safeParse(value).success;
}
