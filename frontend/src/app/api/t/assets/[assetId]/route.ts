import { StableIdSchema } from "@ppt-digital-human/contracts";
import { bffErrorResponse, bffInvalidRequestResponse, getApplicationConfig } from "@/lib/api/tracer-bff";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  try {
    const { assetId } = await context.params; if (!StableIdSchema.safeParse(assetId).success) return bffInvalidRequestResponse("交付资产 ID 不合法。");
    const config = getApplicationConfig(); const headers = new Headers({ "X-Internal-Token": config.internalToken, "X-Principal": config.principal });
    for (const name of ["range", "if-none-match"]) { const value = request.headers.get(name); if (value) headers.set(name, value); }
    const upstream = await fetch(`${config.baseUrl}/v1/assets/${encodeURIComponent(assetId)}/content`, { headers, signal: AbortSignal.timeout(30_000), cache: "no-store" });
    const responseHeaders = new Headers(); for (const name of ["accept-ranges", "cache-control", "content-disposition", "content-length", "content-range", "content-type", "etag"]) { const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value); }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch { return bffErrorResponse(); }
}
