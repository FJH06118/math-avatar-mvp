import { StableIdSchema, WorkflowRunRetryInputSchema } from "@ppt-digital-human/contracts";
import {
  bffErrorResponse,
  bffInvalidRequestResponse,
  getApplicationConfig,
  parseApplicationResponse,
} from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> },
): Promise<Response> {
  try {
    const { workflowId } = await context.params;
    const body = WorkflowRunRetryInputSchema.safeParse(await request.json());
    if (!StableIdSchema.safeParse(workflowId).success || !body.success) {
      return bffInvalidRequestResponse("生成工作流重试请求不合法。");
    }
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/workflows/${encodeURIComponent(workflowId)}/retry`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Internal-Token": config.internalToken,
          "X-Principal": config.principal,
        },
        body: JSON.stringify(body.data),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    return Response.json(await parseApplicationResponse(upstream, "workflow"), {
      status: upstream.status,
    });
  } catch {
    return bffErrorResponse();
  }
}
