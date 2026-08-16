import { StableIdSchema } from "@ppt-digital-human/contracts";
import {
  bffErrorResponse,
  bffInvalidRequestResponse,
  getApplicationConfig,
  parseApplicationResponse,
} from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workflowId: string }> },
): Promise<Response> {
  try {
    const { workflowId } = await context.params;
    if (!StableIdSchema.safeParse(workflowId).success) {
      return bffInvalidRequestResponse("生成工作流 ID 不合法。");
    }
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/workflows/${encodeURIComponent(workflowId)}`,
      {
        headers: {
          "X-Internal-Token": config.internalToken,
          "X-Principal": config.principal,
        },
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
