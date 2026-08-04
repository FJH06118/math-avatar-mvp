import { PlanTaskCreateRequestSchema, StableIdSchema } from "@ppt-digital-human/contracts";
import { bffErrorResponse, getApplicationConfig, parseApplicationResponse } from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await context.params;
    const body = PlanTaskCreateRequestSchema.safeParse(await request.json());
    if (!StableIdSchema.safeParse(projectId).success || !body.success) return invalidRequest();
    const config = getApplicationConfig();
    const upstream = await fetch(`${config.baseUrl}/v1/projects/${encodeURIComponent(projectId)}/plans`, {
      method: "POST",
      headers: internalHeaders(config),
      body: JSON.stringify(body.data),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    return Response.json(await parseApplicationResponse(upstream, "plan-task"), { status: upstream.status });
  } catch { return bffErrorResponse(); }
}

function internalHeaders(config: ReturnType<typeof getApplicationConfig>) {
  return { "content-type": "application/json", "X-Internal-Token": config.internalToken, "X-Principal": config.principal };
}

function invalidRequest(): Response {
  return Response.json({ error: { code: "INVALID_REQUEST", message: "规划请求不合法。", retryable: false, details: {} }, meta: { requestId: `request_${crypto.randomUUID()}`, inputVersion: "v1", outputVersion: "v1" } }, { status: 400 });
}
