import { StableIdSchema } from "@ppt-digital-human/contracts";

import { bffErrorResponse, bffInvalidRequestResponse, getApplicationConfig } from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    const { taskId } = await context.params;
    if (!StableIdSchema.safeParse(taskId).success) return bffInvalidRequestResponse("字幕任务 ID 不合法。");
    const config = getApplicationConfig();
    const headers = new Headers({ "X-Internal-Token": config.internalToken, "X-Principal": config.principal });
    const etag = request.headers.get("if-none-match");
    if (etag) headers.set("if-none-match", etag);
    const upstream = await fetch(`${config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}/captions.vtt`, {
      headers, signal: AbortSignal.timeout(30_000), cache: "no-store",
    });
    const responseHeaders = new Headers();
    for (const name of ["cache-control", "content-length", "content-type", "etag"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return bffErrorResponse();
  }
}
