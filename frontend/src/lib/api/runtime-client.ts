import { ApiErrorSchema, RuntimeDiagnosticSchema, RuntimeHealthResponseSchema, RuntimeHealthSchema, type RuntimeHealth, type RuntimeHealthComponent, type RuntimeHealthStatus } from "@ppt-digital-human/contracts";
import { z } from "zod";

const DesktopRuntimeComponentSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  version: z.string().min(1).max(80),
  state: z.enum(["STOPPED", "STARTING", "HEALTH_CHECKING", "HEALTHY", "STOPPING", "EXITED_UNEXPECTEDLY", "FAILED"]),
  exitCode: z.number().int().nullable(),
}).strict();

const DesktopRuntimeSnapshotSchema = z.object({
  state: z.enum(["STOPPED", "DISCOVERING", "STARTING", "READY", "DEGRADED", "STOPPING", "FAILED", "BLOCKED"]),
  attempt: z.number().int().min(0).max(2),
  retryable: z.boolean(),
  errorCode: z.string().nullable(),
  updatedAt: z.string().datetime(),
  components: z.array(DesktopRuntimeComponentSchema),
}).strict();

const DesktopHostInfoSchema = z.object({
  appVersion: z.string().min(1).max(80),
  apiVersion: z.literal("v1"),
  phase: z.string().min(1).max(20),
  runtimeSupervisorStarted: z.boolean(),
  runtime: DesktopRuntimeSnapshotSchema.nullable(),
  disk: z.object({
    state: z.enum(["READY", "WARN", "FAILED", "UNKNOWN"]),
    freeBytes: z.number().int().nonnegative().nullable(),
    totalBytes: z.number().int().nonnegative().nullable(),
    updatedAt: z.string().datetime(),
  }).strict(),
  workflow: z.object({
    status: z.enum(["idle", "running", "succeeded", "failed", "cancelled"]),
    stage: z.string().min(1).max(40).nullable(),
    progress: z.number().int().min(0).max(100),
  }).strict(),
}).strict();

type DesktopHostInfo = z.infer<typeof DesktopHostInfoSchema>;
type DesktopRuntimeState = z.infer<typeof DesktopRuntimeSnapshotSchema>["state"];

interface DesktopHostBridge {
  getInfo(): Promise<unknown>;
  retryRuntime?(): Promise<unknown>;
  setWorkflowState?(state: unknown): Promise<unknown>;
}

function getDesktopBridge(): DesktopHostBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { desktopHost?: unknown }).desktopHost;
  if (!candidate || typeof candidate !== "object") return null;
  const bridge = candidate as Partial<DesktopHostBridge>;
  return typeof bridge.getInfo === "function" ? (bridge as DesktopHostBridge) : null;
}

export async function getRuntimeHealth(signal?: AbortSignal): Promise<RuntimeHealth> {
  const response = await fetch("/api/runtime/health", { signal, cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throwRuntimeError(payload, "运行时健康状态读取失败。");
  const serverHealth = RuntimeHealthResponseSchema.parse(payload).data;
  const bridge = getDesktopBridge();
  if (!bridge) return serverHealth;

  const hostResult = DesktopHostInfoSchema.safeParse(await bridge.getInfo().catch(() => null));
  if (!hostResult.success) return serverHealth;
  return mergeDesktopHealth(serverHealth, hostResult.data);
}

export async function getRuntimeDiagnostic(signal?: AbortSignal) {
  const health = await getRuntimeHealth(signal);
  return RuntimeDiagnosticSchema.parse({
    schemaVersion: "runtime-diagnostic-v1",
    generatedAt: new Date().toISOString(),
    health,
  });
}

export async function downloadRuntimeDiagnostic(signal?: AbortSignal): Promise<void> {
  const diagnostic = await getRuntimeDiagnostic(signal);
  const blob = new Blob([JSON.stringify(diagnostic, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `math-avatar-diagnostic-${diagnostic.generatedAt.replaceAll(":", "-")}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function publishDesktopWorkflowState(input: {
  status: "idle" | "running" | "succeeded" | "failed" | "cancelled";
  stage?: string | null;
  progress: number;
}): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.setWorkflowState) return;
  await bridge.setWorkflowState({
    status: input.status,
    stage: input.stage ?? null,
    progress: Math.max(0, Math.min(100, Math.round(input.progress))),
  }).catch(() => undefined);
}

export function isDesktopHostAvailable(): boolean {
  return Boolean(getDesktopBridge());
}

export async function retryDesktopRuntime(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.retryRuntime) throw new Error("当前页面不在桌面宿主中。" );
  const result = await bridge.retryRuntime();
  if (!DesktopHostInfoSchema.safeParse(result).success) {
    throw new Error("桌面运行时返回了无法识别的状态。" );
  }
}

function mergeDesktopHealth(serverHealth: RuntimeHealth, host: DesktopHostInfo): RuntimeHealth {
  const components = [...serverHealth.components];
  components.push({
    id: "desktop-host",
    status: hostStatus(host.runtime?.state, host.runtimeSupervisorStarted),
    message: host.runtime
      ? `桌面宿主运行时状态：${host.runtime.state}。`
      : "桌面宿主尚未提供运行时快照。",
    action: host.runtime?.errorCode ? "打开诊断面板并重试运行时。" : null,
    version: host.appVersion,
    latencyMs: null,
  });
  if (host.runtime) {
    for (const component of host.runtime.components) {
      components.push({
        id: `runtime-${component.id}`,
        status: componentStatus(component.state),
        message: `${component.id}：${component.state}。`,
        action: component.state === "FAILED" || component.state === "EXITED_UNEXPECTEDLY"
          ? "请重试运行时；如果问题持续，请导出诊断报告。"
          : null,
        version: component.version,
        latencyMs: null,
      });
    }
  }
  components.push({
    id: "disk",
    status: host.disk.state === "READY" ? "READY" : host.disk.state === "WARN" ? "WARN" : host.disk.state === "FAILED" ? "FAILED" : "UNKNOWN",
    message: host.disk.freeBytes === null
      ? "暂时无法读取本地磁盘空间。"
      : `可用空间约 ${formatBytes(host.disk.freeBytes)}。`,
    action: host.disk.state === "WARN" || host.disk.state === "FAILED"
      ? "请清理用户数据目录中的旧媒体或选择其他磁盘。"
      : null,
    version: null,
    latencyMs: null,
  });
  components.push({
    id: "workflow-queue",
    status: host.workflow.status === "failed" ? "WARN" : "READY",
    message: host.workflow.status === "running"
      ? `后台生成任务正在运行（${host.workflow.progress}%）。`
      : host.workflow.status === "failed"
        ? "最近一次后台生成任务失败。"
        : "后台生成工作流可用。",
    action: host.workflow.status === "failed" ? "打开生成页查看错误并重试失败阶段。" : null,
    version: null,
    latencyMs: null,
  });
  return RuntimeHealthSchema.parse({
    ...serverHealth,
    status: aggregateStatus(components),
    components,
  });
}

function hostStatus(
  state: DesktopRuntimeState | undefined,
  started: boolean,
): RuntimeHealthStatus {
  if (!started) return "UNKNOWN";
  if (state === "READY") return "READY";
  if (state === "FAILED" || state === "BLOCKED") return "FAILED";
  if (state === "DEGRADED") return "WARN";
  return "UNKNOWN";
}

function componentStatus(state: z.infer<typeof DesktopRuntimeComponentSchema>["state"]): RuntimeHealthStatus {
  if (state === "HEALTHY") return "READY";
  if (state === "FAILED" || state === "EXITED_UNEXPECTEDLY") return "FAILED";
  if (state === "STOPPED") return "UNKNOWN";
  return "WARN";
}

function aggregateStatus(components: readonly RuntimeHealthComponent[]): RuntimeHealthStatus {
  if (components.some((component) => component.status === "FAILED")) return "FAILED";
  if (components.some((component) => component.status === "NOT_CONFIGURED")) return "NOT_CONFIGURED";
  if (components.some((component) => component.status === "WARN" || component.status === "UNKNOWN")) return "WARN";
  return "READY";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function throwRuntimeError(payload: unknown, fallback: string): never {
  const parsed = ApiErrorSchema.safeParse(payload);
  throw new Error(parsed.success ? parsed.data.error.message : fallback);
}
