import { LessonPlanRevisionEditRequestSchema, StableIdSchema } from "@ppt-digital-human/contracts";
import { bffErrorResponse, bffInvalidRequestResponse, getApplicationConfig, parseApplicationResponse } from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ revisionId: string }> }): Promise<Response> {
  try {
    const { revisionId } = await context.params;
    const body = LessonPlanRevisionEditRequestSchema.safeParse(await request.json());
    if (!StableIdSchema.safeParse(revisionId).success || !body.success) return bffInvalidRequestResponse("讲稿修订请求不合法。");
    const config = getApplicationConfig();
    const upstream = await fetch(`${config.baseUrl}/v1/revisions/${encodeURIComponent(revisionId)}/revise`, {
      method: "POST", headers: { "content-type": "application/json", "X-Internal-Token": config.internalToken, "X-Principal": config.principal },
      body: JSON.stringify(body.data), signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    return Response.json(await parseApplicationResponse(upstream, "revision"), { status: upstream.status });
  } catch { return bffErrorResponse(); }
}
