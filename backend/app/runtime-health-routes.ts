import { randomUUID } from "node:crypto";
import {
  RuntimeDiagnosticResponseSchema,
  RuntimeHealthResponseSchema,
  type RuntimeHealthComponent,
  type RuntimeHealthStatus,
} from "@ppt-digital-human/contracts";
import { Hono } from "hono";
import type { Context } from "hono";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { ProviderService } from "./provider-service.ts";

export interface RuntimeHealthRouteDependencies {
  prisma: PrismaClient;
  providerService: ProviderService;
  authenticate: (context: Context) => string;
}

export function createRuntimeHealthRoutes(
  dependencies: RuntimeHealthRouteDependencies,
): Hono {
  const routes = new Hono();

  routes.get("/v1/runtime/health", async (context) => {
    const principal = dependencies.authenticate(context);
    const health = await readHealth(dependencies, principal);
    return context.json(RuntimeHealthResponseSchema.parse({ data: health, meta: apiMeta() }));
  });

  routes.get("/v1/runtime/diagnostic", async (context) => {
    const principal = dependencies.authenticate(context);
    const health = await readHealth(dependencies, principal);
    const diagnostic = {
      schemaVersion: "runtime-diagnostic-v1" as const,
      generatedAt: new Date().toISOString(),
      health,
    };
    return context.json(
      RuntimeDiagnosticResponseSchema.parse({ data: diagnostic, meta: apiMeta() }),
    );
  });

  return routes;
}

async function readHealth(
  dependencies: RuntimeHealthRouteDependencies,
  principal: string,
) {
  const checkedAt = new Date().toISOString();
  const components: RuntimeHealthComponent[] = [];

  const databaseStartedAt = Date.now();
  try {
    await dependencies.prisma.$queryRaw`SELECT 1`;
    components.push({
      id: "database",
      status: "READY",
      message: "本地数据库连接正常。",
      action: null,
      version: null,
      latencyMs: Date.now() - databaseStartedAt,
    });
  } catch {
    components.push({
      id: "database",
      status: "FAILED",
      message: "本地数据库暂时不可用。",
      action: "请重试；如果问题持续，请重启桌面运行时。",
      version: null,
      latencyMs: null,
    });
  }

  components.push({
    id: "api",
    status: "READY",
    message: "本地业务服务已响应。",
    action: null,
    version: "v1",
    latencyMs: null,
  });

  try {
    const settings = await dependencies.providerService.settings(principal);
    const provider = settings.providers.find(
      (candidate) => candidate.id === settings.defaultProviderId,
    );
    components.push(providerHealth(provider));
  } catch {
    components.push({
      id: "provider",
      status: "UNKNOWN",
      message: "Provider 设置暂时无法读取。",
      action: "请刷新设置页；如果问题持续，请重启桌面运行时。",
      version: null,
      latencyMs: null,
    });
  }

  components.push({
    id: "edge-tts",
    status: "WARN",
    message: "Edge TTS 尚未在此面板执行试听。",
    action: "打开课程工作台，在授课配置中点击试听并确认音频可播放。",
    version: "edge-word-boundary-v1",
    latencyMs: null,
  });

  const mode = process.env.PPT_DH_API_MODE === "mock" && process.env.NODE_ENV !== "production"
    ? "mock"
    : "production";
  return {
    mode,
    status: aggregateStatus(components),
    checkedAt,
    components,
  };
}

function providerHealth(
  provider:
    | {
        enabled: boolean;
        keyConfigured: boolean;
        lastTestAt: string | null;
        displayName: string;
      }
    | undefined,
): RuntimeHealthComponent {
  if (!provider) {
    return {
      id: "provider",
      status: "NOT_CONFIGURED",
      message: "尚未配置默认 Provider。",
      action: "打开设置页，保存 API 地址、模型和密钥，然后设为默认。",
      version: null,
      latencyMs: null,
    };
  }
  if (!provider.enabled || !provider.keyConfigured) {
    return {
      id: "provider",
      status: "NOT_CONFIGURED",
      message: `${provider.displayName} 尚未具备可用的默认密钥配置。`,
      action: "在设置页轮换密钥、启用 Provider，并重新执行连接测试。",
      version: null,
      latencyMs: null,
    };
  }
  if (!provider.lastTestAt) {
    return {
      id: "provider",
      status: "WARN",
      message: `${provider.displayName} 已配置，但还没有通过真实连接测试。`,
      action: "在设置页点击“连接测试”，确认地址、模型、密钥和网络均可用。",
      version: null,
      latencyMs: null,
    };
  }
  return {
    id: "provider",
    status: "READY",
    message: `${provider.displayName} 已通过最近一次真实连接测试。`,
    action: null,
    version: null,
    latencyMs: null,
  };
}

function aggregateStatus(components: readonly RuntimeHealthComponent[]): RuntimeHealthStatus {
  if (components.some((component) => component.status === "FAILED")) return "FAILED";
  if (components.some((component) => component.status === "NOT_CONFIGURED")) {
    return "NOT_CONFIGURED";
  }
  if (components.some((component) => component.status === "WARN" || component.status === "UNKNOWN")) {
    return "WARN";
  }
  return "READY";
}

function apiMeta() {
  return { requestId: `request_${randomUUID()}`, inputVersion: "v1", outputVersion: "v1" };
}
