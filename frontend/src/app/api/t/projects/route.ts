import { TracerUploadMetadataSchema } from "@ppt-digital-human/contracts";
import {
  bffErrorResponse,
  getApplicationConfig,
  parseApplicationResponse,
} from "@/lib/api/tracer-bff";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = getApplicationConfig();
    const upstreamUrl = new URL(`${config.baseUrl}/v1/projects`);
    const requested = new URL(request.url);
    for (const key of ["search", "status", "includeArchived"]) {
      const value = requested.searchParams.get(key);
      if (value !== null) upstreamUrl.searchParams.set(key, value);
    }
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "X-Internal-Token": config.internalToken,
        "X-Principal": config.principal,
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = await parseApplicationResponse(upstream, "project-list");
    return Response.json(body, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const title = form.get("title");
    const file = form.get("file");
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    if (typeof title !== "string" || !(file instanceof File)) {
      return invalidRequest("请求必须包含标题和 PPT/PPTX 文件。");
    }
    const metadata = TracerUploadMetadataSchema.safeParse({
      title,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      idempotencyKey,
    });
    if (!metadata.success) {
      return invalidRequest("上传元数据不符合课件上传契约。");
    }
    const config = getApplicationConfig();
    const upstreamForm = new FormData();
    upstreamForm.set("title", metadata.data.title);
    upstreamForm.set("file", file);
    const upstream = await fetch(`${config.baseUrl}/v1/projects`, {
      method: "POST",
      headers: {
        "Idempotency-Key": metadata.data.idempotencyKey,
        "X-Internal-Token": config.internalToken,
        "X-Principal": config.principal,
      },
      body: upstreamForm,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const body = await parseApplicationResponse(upstream, "upload");
    return Response.json(body, { status: upstream.status });
  } catch {
    return bffErrorResponse();
  }
}

function invalidRequest(message: string): Response {
  return Response.json(
    {
      error: { code: "INVALID_REQUEST", message, retryable: false, details: {} },
      meta: {
        requestId: `request_${crypto.randomUUID()}`,
        inputVersion: "v1",
        outputVersion: "v1",
      },
    },
    { status: 400 },
  );
}
