import { StableIdSchema } from "@ppt-digital-human/contracts";

import { bffErrorResponse, bffInvalidRequestResponse, getApplicationConfig } from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  try {
    const { assetId } = await context.params;
    if (!StableIdSchema.safeParse(assetId).success) return bffInvalidRequestResponse("试听音频 ID 不合法。");
    const config = getApplicationConfig();
    const headers = new Headers({ "X-Internal-Token": config.internalToken, "X-Principal": config.principal });
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch) headers.set("if-none-match", ifNoneMatch);
    const upstream = await fetch(`${config.baseUrl}/v1/assets/${encodeURIComponent(assetId)}/audio-preview`, {
      headers,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    for (const name of ["accept-ranges", "cache-control", "content-length", "content-type", "etag"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return bffErrorResponse();
  }
}
