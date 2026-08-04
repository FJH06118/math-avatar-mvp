import { StableIdSchema } from "@ppt-digital-human/contracts";
import {
  bffErrorResponse,
  getApplicationConfig,
  parseApplicationResponse,
} from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
): Promise<Response> {
  try {
    const { taskId } = await context.params;
    if (!StableIdSchema.safeParse(taskId).success) {
      return Response.json(
        {
          error: {
            code: "INVALID_TASK_ID",
            message: "任务 ID 不合法。",
            retryable: false,
            details: {},
          },
          meta: {
            requestId: `request_${crypto.randomUUID()}`,
            inputVersion: "v1",
            outputVersion: "v1",
          },
        },
        { status: 400 },
      );
    }
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}/cancel`,
      {
        method: "POST",
        headers: {
          "X-Internal-Token": config.internalToken,
          "X-Principal": config.principal,
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    const body = await parseApplicationResponse(upstream, "task");
    return Response.json(body, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}
