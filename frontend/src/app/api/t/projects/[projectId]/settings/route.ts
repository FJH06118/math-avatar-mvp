import {
  StableIdSchema,
  TeachingSettingsUpdateInputSchema,
} from "@ppt-digital-human/contracts";

import {
  bffErrorResponse,
  bffInvalidRequestResponse,
  getApplicationConfig,
  parseApplicationResponse,
} from "@/lib/api/tracer-bff";

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  try {
    const { projectId } = await context.params;
    if (!StableIdSchema.safeParse(projectId).success) {
      return bffInvalidRequestResponse("项目 ID 不合法。");
    }
    const parsed = TeachingSettingsUpdateInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return bffInvalidRequestResponse("授课设置请求不合法。");
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/projects/${encodeURIComponent(projectId)}/settings`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "X-Internal-Token": config.internalToken,
          "X-Principal": config.principal,
        },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    const body = await parseApplicationResponse(upstream, "settings");
    return Response.json(body, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}
