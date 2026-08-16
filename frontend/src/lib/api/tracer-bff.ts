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
  ProjectListResponseSchema,
  ProjectResponseSchema,
  ParseSnapshotResponseSchema,
  WorkspaceLockResponseSchema,
  WorkspaceSnapshotResponseSchema,
  TeachingSettingsResponseSchema,
  WorkflowRunResponseSchema,
  ApplicationSettingsResponseSchema,
  ProviderProfileListResponseSchema,
  ProviderProfileResponseSchema,
  ProviderTestResponseSchema,
  RuntimeDiagnosticResponseSchema,
  RuntimeHealthResponseSchema,
  StableIdSchema,
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
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error("PPT_DH_APP_BASE_URL must be a credential-free loopback HTTP URL.");
  }
  return { baseUrl: url.toString().replace(/\/$/, ""), internalToken, principal };
}

export async function parseApplicationResponse(
  response: Response,
  kind: "upload" | "task" | "parse-snapshot" | "workspace" | "workspace-lock" | "settings" | "application-settings" | "provider-list" | "provider" | "provider-test" | "runtime-health" | "runtime-diagnostic" | "plan-task" | "revision" | "revision-list" | "audio-task" | "audio-timeline" | "render-task" | "render-pages" | "composite-task" | "final-media" | "delivery" | "project" | "project-list" | "workflow",
) {
  const body: unknown = await response.json();
  if (response.ok) {
    if (kind === "upload") return TracerUploadResponseSchema.parse(body);
    if (kind === "task") return TracerTaskResponseSchema.parse(body);
    if (kind === "parse-snapshot") return ParseSnapshotResponseSchema.parse(body);
    if (kind === "workspace") return WorkspaceSnapshotResponseSchema.parse(body);
    if (kind === "workspace-lock") return WorkspaceLockResponseSchema.parse(body);
    if (kind === "settings") return TeachingSettingsResponseSchema.parse(body);
    if (kind === "application-settings") return ApplicationSettingsResponseSchema.parse(body);
    if (kind === "provider-list") return ProviderProfileListResponseSchema.parse(body);
    if (kind === "provider") return ProviderProfileResponseSchema.parse(body);
    if (kind === "provider-test") return ProviderTestResponseSchema.parse(body);
    if (kind === "runtime-health") return RuntimeHealthResponseSchema.parse(body);
    if (kind === "runtime-diagnostic") return RuntimeDiagnosticResponseSchema.parse(body);
    if (kind === "plan-task") return PlanTaskResponseSchema.parse(body);
    if (kind === "audio-task") return AudioTaskResponseSchema.parse(body);
    if (kind === "audio-timeline") return AudioTimelineResponseSchema.parse(body);
    if (kind === "render-task") return RenderTaskResponseSchema.parse(body);
    if (kind === "render-pages") return RenderedPageListResponseSchema.parse(body);
    if (kind === "composite-task") return CompositeTaskResponseSchema.parse(body);
    if (kind === "final-media") return FinalMediaResponseSchema.parse(body);
    if (kind === "delivery") return DeliveryManifestResponseSchema.parse(body);
    if (kind === "project") return ProjectResponseSchema.parse(body);
    if (kind === "project-list") return ProjectListResponseSchema.parse(body);
    if (kind === "workflow") return WorkflowRunResponseSchema.parse(body);
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

export function getRequiredProjectScope(request: Request): string | null {
  const projectId = new URL(request.url).searchParams.get("projectId");
  return StableIdSchema.safeParse(projectId).success ? projectId : null;
}
