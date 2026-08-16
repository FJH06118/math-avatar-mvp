import type { MockRequestOptions } from "@/types";
import { RealApiError } from "./real-tracer";

export class MockApiError extends Error {
  constructor(
    message: string,
    public readonly code = "MOCK_API_ERROR",
  ) {
    super(message);
    this.name = "MockApiError";
  }
}

export function getUserFacingErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof MockApiError || error instanceof RealApiError
    ? error.message
    : fallback;
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("请求已取消", "AbortError"));
      return;
    }

    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("请求已取消", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function simulateRequest(
  options: MockRequestOptions = {},
  duration = 500,
): Promise<void> {
  await delay(duration, options.signal);
  if (options.fail) {
    throw new MockApiError("模拟请求失败，请重试。");
  }
}

export function requireRecord<T>(record: T | undefined, label: string): T {
  if (!record) {
    throw new MockApiError(`${label}不存在或已被删除。`, "NOT_FOUND");
  }
  return record;
}
