import { StableIdSchema, WorkspaceLockInputSchema } from "@ppt-digital-human/contracts";

import {
  bffErrorResponse,
  bffInvalidRequestResponse,
  getApplicationConfig,
  parseApplicationResponse,
} from "@/lib/api/tracer-bff";

export async function POST(
  request: Request,
  context: { params: Promise<{ revisionId: string }> },
): Promise<Response> {
  try {
    const { revisionId } = await context.params;
    if (!StableIdSchema.safeParse(revisionId).success) {
      return bffInvalidRequestResponse("修订 ID 不合法。");
    }
    const parsed = WorkspaceLockInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return bffInvalidRequestResponse("锁定请求不合法。");
    const config = getApplicationConfig();
    const upstream = await fetch(
      `${config.baseUrl}/v1/revisions/${encodeURIComponent(revisionId)}/lock`,
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
    const body = await parseApplicationResponse(upstream, "workspace-lock");
    return Response.json(body, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}
