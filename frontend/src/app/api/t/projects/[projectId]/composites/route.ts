import { CompositeTaskCreateRequestSchema, StableIdSchema } from "@ppt-digital-human/contracts";
import { bffErrorResponse, bffInvalidRequestResponse, getApplicationConfig, parseApplicationResponse } from "@/lib/api/tracer-bff";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await context.params; const body = CompositeTaskCreateRequestSchema.safeParse(await request.json());
    if (!StableIdSchema.safeParse(projectId).success || !body.success) return bffInvalidRequestResponse("最终合成请求不合法。");
    const config = getApplicationConfig(); const upstream = await fetch(`${config.baseUrl}/v1/projects/${encodeURIComponent(projectId)}/composites`, { method: "POST", headers: { "content-type": "application/json", "X-Internal-Token": config.internalToken, "X-Principal": config.principal }, body: JSON.stringify(body.data), signal: AbortSignal.timeout(10_000), cache: "no-store" });
    return Response.json(await parseApplicationResponse(upstream, "composite-task"), { status: upstream.status });
  } catch { return bffErrorResponse(); }
}
