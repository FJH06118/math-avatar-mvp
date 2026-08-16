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
  context: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  try {
    const { projectId } = await context.params;
    if (!StableIdSchema.safeParse(projectId).success) {
      return bffInvalidRequestResponse("项目 ID 不合法。");
    }
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/projects/${encodeURIComponent(projectId)}/workspace`,
      {
        headers: {
          "X-Internal-Token": config.internalToken,
          "X-Principal": config.principal,
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    const body = await parseApplicationResponse(upstream, "workspace");
    return Response.json(body, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}
