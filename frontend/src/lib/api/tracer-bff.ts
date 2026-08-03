import {
  ApiErrorSchema,
  TracerTaskResponseSchema,
  TracerUploadResponseSchema,
} from "@ppt-digital-human/contracts";

export function getApplicationConfig(): {
  baseUrl: string;
  internalToken: string;
  principal: string;
} {
  const baseUrl = process.env.PPT_DH_APP_BASE_URL;
  const internalToken = process.env.PPT_DH_INTERNAL_TOKEN;
  const principal = process.env.PPT_DH_INTERNAL_PRINCIPAL;
  if (!baseUrl || !internalToken || !principal) {
    throw new Error("Stage T BFF configuration is incomplete.");
  }
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("PPT_DH_APP_BASE_URL must use HTTP(S).");
  }
  return { baseUrl: url.toString().replace(/\/$/, ""), internalToken, principal };
}

export async function parseApplicationResponse(response: Response, kind: "upload" | "task") {
  const body: unknown = await response.json();
  if (response.ok) {
    return kind === "upload"
      ? TracerUploadResponseSchema.parse(body)
      : TracerTaskResponseSchema.parse(body);
  }
  return ApiErrorSchema.parse(body);
}

export function bffErrorResponse(): Response {
  return Response.json(
    ApiErrorSchema.parse({
      error: {
        code: "BFF_UPSTREAM_UNAVAILABLE",
        message: "应用服务暂时不可用。",
        retryable: true,
        details: {},
      },
      meta: {
        requestId: `request_${crypto.randomUUID()}`,
        inputVersion: "v1",
        outputVersion: "v1",
      },
    }),
    { status: 503 },
  );
}
