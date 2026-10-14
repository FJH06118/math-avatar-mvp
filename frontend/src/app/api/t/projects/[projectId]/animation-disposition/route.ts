import { StableIdSchema } from "@ppt-digital-human/contracts";
import { bffErrorResponse, bffInvalidRequestResponse, getApplicationConfig, parseApplicationResponse } from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

/** M1：读取逐页动画事实、当前处置与只含计数的结果报告。 */
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await context.params;
    if (!StableIdSchema.safeParse(projectId).success) return bffInvalidRequestResponse("项目标识不合法。");
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/projects/${encodeURIComponent(projectId)}/animation-disposition`,
      {
        headers: { "X-Internal-Token": config.internalToken, "X-Principal": config.principal },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    return Response.json(await parseApplicationResponse(upstream, "animation-disposition"), {
      status: upstream.status,
    });
  } catch {
    return bffErrorResponse();
  }
}
