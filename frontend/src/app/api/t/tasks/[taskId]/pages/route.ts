import { StableIdSchema } from "@ppt-digital-human/contracts";
import { bffErrorResponse, bffInvalidRequestResponse, getApplicationConfig, parseApplicationResponse } from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    const { taskId } = await context.params;
    if (!StableIdSchema.safeParse(taskId).success) return bffInvalidRequestResponse("分页渲染任务 ID 不合法。");
    const config = getApplicationConfig();
    const upstream = await fetch(`${config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}/pages`, {
      headers: { "X-Internal-Token": config.internalToken, "X-Principal": config.principal }, signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    return Response.json(await parseApplicationResponse(upstream, "render-pages"), { status: upstream.status });
  } catch { return bffErrorResponse(); }
}
