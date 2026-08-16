export class AppHttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 500 | 503,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppHttpError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
