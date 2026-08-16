import { ProjectVersionInputSchema } from "@ppt-digital-human/contracts";

import {
  bffErrorResponse,
  bffInvalidRequestResponse,
  getApplicationConfig,
  parseApplicationResponse,
} from "@/lib/api/tracer-bff";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = ProjectVersionInputSchema.safeParse(body);
  if (!parsed.success) return bffInvalidRequestResponse("项目版本不符合契约。");
  try {
    const { projectId } = await context.params;
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/projects/${encodeURIComponent(projectId)}/archive`,
      {
        method: "POST",
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
    const payload = await parseApplicationResponse(upstream, "project");
    return Response.json(payload, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}
