import { StableIdSchema } from "@ppt-digital-human/contracts";
import { bffErrorResponse, bffInvalidRequestResponse, getApplicationConfig, getRequiredProjectScope } from "@/lib/api/tracer-bff";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }): Promise<Response> {
  try {
    const { taskId } = await context.params; if (!StableIdSchema.safeParse(taskId).success) return bffInvalidRequestResponse("交付任务 ID 不合法。");
    const projectId = getRequiredProjectScope(request); if (!projectId) return bffInvalidRequestResponse("结果资源请求必须带有项目 ID。");
    const config = getApplicationConfig(); const headers = new Headers({ "X-Internal-Token": config.internalToken, "X-Principal": config.principal });
    for (const name of ["range", "if-none-match"]) { const value = request.headers.get(name); if (value) headers.set(name, value); }
    const upstream = await fetch(`${config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}/delivery/metadata?projectId=${encodeURIComponent(projectId)}`, { headers, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    return passDownload(upstream);
  } catch { return bffErrorResponse(); }
}
function passDownload(upstream: Response): Response { const headers = new Headers(); for (const name of ["accept-ranges", "cache-control", "content-disposition", "content-length", "content-range", "content-type", "etag"]) { const value = upstream.headers.get(name); if (value) headers.set(name, value); } return new Response(upstream.body, { status: upstream.status, headers }); }
