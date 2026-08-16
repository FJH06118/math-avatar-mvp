import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  ApplicationSettingsResponseSchema,
  ProviderProfileCreateInputSchema,
  ProviderProfileDeleteInputSchema,
  ProviderProfileListResponseSchema,
  ProviderProfileResponseSchema,
  ProviderProfileSetDefaultInputSchema,
  ProviderProfileUpdateInputSchema,
  ProviderTestRequestSchema,
  ProviderTestResponseSchema,
} from "@ppt-digital-human/contracts";
import { AppHttpError } from "./errors.ts";
import { ProviderService } from "./provider-service.ts";

export interface ProviderRouteDependencies {
  service: ProviderService;
  authenticate: (context: Context) => string;
}

export function createProviderRoutes(dependencies: ProviderRouteDependencies): Hono {
  const routes = new Hono();

  routes.get("/v1/settings", async (context) => {
    const principal = dependencies.authenticate(context);
    const settings = await dependencies.service.settings(principal);
    return context.json(ApplicationSettingsResponseSchema.parse({ data: settings, meta: apiMeta() }));
  });

  routes.get("/v1/providers", async (context) => {
    const principal = dependencies.authenticate(context);
    const providers = await dependencies.service.list(principal);
    return context.json(ProviderProfileListResponseSchema.parse({ data: providers, meta: apiMeta() }));
  });

  routes.post("/v1/providers", async (context) => {
    const principal = dependencies.authenticate(context);
    const parsed = ProviderProfileCreateInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidProviderBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const provider = await dependencies.service.create(principal, parsed.data);
    return context.json(ProviderProfileResponseSchema.parse({ data: provider, meta: apiMeta() }), 201);
  });

  routes.patch("/v1/providers/:providerId", async (context) => {
    const principal = dependencies.authenticate(context);
    const parsed = ProviderProfileUpdateInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidProviderBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const provider = await dependencies.service.update(principal, context.req.param("providerId"), parsed.data);
    return context.json(ProviderProfileResponseSchema.parse({ data: provider, meta: apiMeta() }));
  });

  routes.post("/v1/providers/:providerId/default", async (context) => {
    const principal = dependencies.authenticate(context);
    const parsed = ProviderProfileSetDefaultInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidProviderBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const provider = await dependencies.service.setDefault(principal, context.req.param("providerId"), parsed.data.expectedVersion);
    return context.json(ProviderProfileResponseSchema.parse({ data: provider, meta: apiMeta() }));
  });

  routes.post("/v1/providers/:providerId/test", async (context) => {
    const principal = dependencies.authenticate(context);
    const parsed = ProviderTestRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidProviderBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    const result = await dependencies.service.test(principal, context.req.param("providerId"), parsed.data.expectedVersion);
    return context.json(ProviderTestResponseSchema.parse({ data: result, meta: apiMeta() }));
  });

  routes.delete("/v1/providers/:providerId", async (context) => {
    const principal = dependencies.authenticate(context);
    const parsed = ProviderProfileDeleteInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw invalidProviderBody(parsed.error.issues.map((issue) => issue.path.join(".")));
    await dependencies.service.delete(principal, context.req.param("providerId"), parsed.data.expectedVersion);
    return new Response(null, { status: 204 });
  });

  return routes;
}

function apiMeta() {
  return { requestId: `request_${randomUUID()}`, inputVersion: "v1", outputVersion: "v1" };
}

function invalidProviderBody(fields: string[]): AppHttpError {
  return new AppHttpError(400, "INVALID_REQUEST", "Provider 设置请求不符合严格契约。", false, { fields });
}
