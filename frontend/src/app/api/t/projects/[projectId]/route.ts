import { ProjectVersionInputSchema } from "@ppt-digital-human/contracts";

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
  return proxyProject(context, "GET");
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = ProjectVersionInputSchema.safeParse(body);
  if (!parsed.success) return bffInvalidRequestResponse("项目版本不符合契约。");
  return proxyProject(context, "DELETE", parsed.data);
}

async function proxyProject(
  context: { params: Promise<{ projectId: string }> },
  method: "GET" | "DELETE",
  body?: unknown,
): Promise<Response> {
  try {
    const { projectId } = await context.params;
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/projects/${encodeURIComponent(projectId)}`,
      {
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          "X-Internal-Token": config.internalToken,
          "X-Principal": config.principal,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    if (upstream.status === 204) return new Response(null, { status: 204 });
    const payload = await parseApplicationResponse(upstream, "project");
    return Response.json(payload, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}
