export const RUNTIME_CONTROL_PROTOCOL_VERSION = 1 as const;

export interface RuntimeReadyMessage {
  type: "runtime-ready";
  protocolVersion: typeof RUNTIME_CONTROL_PROTOCOL_VERSION;
  component: "hono" | "worker";
}

export function isRuntimeShutdownMessage(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.type === "runtime-shutdown" &&
    record.protocolVersion === RUNTIME_CONTROL_PROTOCOL_VERSION
  );
}

export function sendRuntimeReady(component: RuntimeReadyMessage["component"]): void {
  if (!process.send) return;
  const message: RuntimeReadyMessage = {
    type: "runtime-ready",
    protocolVersion: RUNTIME_CONTROL_PROTOCOL_VERSION,
    component,
  };
  process.send(message);
}
