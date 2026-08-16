import { StableIdSchema } from "@ppt-digital-human/contracts";
import { bffErrorResponse, bffInvalidRequestResponse, getApplicationConfig, getRequiredProjectScope, parseApplicationResponse } from "@/lib/api/tracer-bff";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    const { taskId } = await context.params; if (!StableIdSchema.safeParse(taskId).success) return bffInvalidRequestResponse("媒体任务 ID 不合法。");
    const projectId = getRequiredProjectScope(request); if (!projectId) return bffInvalidRequestResponse("结果资源请求必须带有项目 ID。");
    const config = getApplicationConfig(); const upstream = await fetch(`${config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}/media?projectId=${encodeURIComponent(projectId)}`, { headers: { "X-Internal-Token": config.internalToken, "X-Principal": config.principal }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    return Response.json(await parseApplicationResponse(upstream, "final-media"), { status: upstream.status });
  } catch { return bffErrorResponse(); }
}
