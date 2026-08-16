import { RetryTaskRequestSchema, StableIdSchema } from "@ppt-digital-human/contracts";

import {
  bffErrorResponse,
  bffInvalidRequestResponse,
  getApplicationConfig,
  parseApplicationResponse,
} from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
): Promise<Response> {
  try {
    const { taskId } = await context.params;
    const body = RetryTaskRequestSchema.safeParse(await request.json().catch(() => null));
    if (!StableIdSchema.safeParse(taskId).success || !body.success) {
      return bffInvalidRequestResponse("重试任务请求不合法。");
    }
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}/retry`,
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
    const response = await parseApplicationResponse(upstream, "task");
    return Response.json(response, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}
