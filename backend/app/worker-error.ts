export class WorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

export function toWorkerError(error: unknown): WorkerError {
  if (error instanceof WorkerError) {
    return error;
  }
  return new WorkerError("PARSE_WORKER_FAILED", "解析 Worker 执行失败。", true);
}
