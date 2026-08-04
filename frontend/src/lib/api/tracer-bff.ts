import {
  ApiErrorSchema,
  TracerTaskResponseSchema,
  TracerUploadResponseSchema,
  LessonPlanRevisionListResponseSchema,
  LessonPlanRevisionResponseSchema,
  PlanTaskResponseSchema,
  AudioTaskResponseSchema,
  AudioTimelineResponseSchema,
  RenderTaskResponseSchema,
  RenderedPageListResponseSchema,
  CompositeTaskResponseSchema,
  FinalMediaResponseSchema,
  DeliveryManifestResponseSchema,
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

export async function parseApplicationResponse(
  response: Response,
  kind: "upload" | "task" | "plan-task" | "revision" | "revision-list" | "audio-task" | "audio-timeline" | "render-task" | "render-pages" | "composite-task" | "final-media" | "delivery",
) {
  const body: unknown = await response.json();
  if (response.ok) {
    if (kind === "upload") return TracerUploadResponseSchema.parse(body);
    if (kind === "task") return TracerTaskResponseSchema.parse(body);
    if (kind === "plan-task") return PlanTaskResponseSchema.parse(body);
    if (kind === "audio-task") return AudioTaskResponseSchema.parse(body);
    if (kind === "audio-timeline") return AudioTimelineResponseSchema.parse(body);
    if (kind === "render-task") return RenderTaskResponseSchema.parse(body);
    if (kind === "render-pages") return RenderedPageListResponseSchema.parse(body);
    if (kind === "composite-task") return CompositeTaskResponseSchema.parse(body);
    if (kind === "final-media") return FinalMediaResponseSchema.parse(body);
    if (kind === "delivery") return DeliveryManifestResponseSchema.parse(body);
    if (kind === "revision") return LessonPlanRevisionResponseSchema.parse(body);
    return LessonPlanRevisionListResponseSchema.parse(body);
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

export function bffInvalidRequestResponse(message: string): Response {
  return Response.json(
    ApiErrorSchema.parse({
      error: { code: "INVALID_REQUEST", message, retryable: false, details: {} },
      meta: { requestId: `request_${crypto.randomUUID()}`, inputVersion: "v1", outputVersion: "v1" },
    }),
    { status: 400 },
  );
}
