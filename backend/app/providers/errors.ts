export type ProviderErrorCode =
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UPSTREAM_FAILED"
  | "PROVIDER_REQUEST_REJECTED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_CONNECTION_FAILED"
  | "PROVIDER_RESPONSE_INVALID"
  | "PROVIDER_OUTPUT_INVALID"
  | "PROVIDER_VISION_UNSUPPORTED"
  | "PROVIDER_PROFILE_NOT_FOUND"
  | "PROVIDER_PROFILE_STALE"
  | "PROVIDER_PROFILE_DISABLED"
  | "PROVIDER_CREDENTIAL_NOT_CONFIGURED"
  | "PROVIDER_SECRET_UNAVAILABLE";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly retryable: boolean,
    message = "Provider 服务不可用。",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function providerErrorFromStatus(status: number): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError("PROVIDER_AUTH_FAILED", false, "Provider 鉴权失败。");
  }
  if (status === 429) {
    return new ProviderError("PROVIDER_RATE_LIMITED", true, "Provider 请求频率受限。");
  }
  if (status >= 500) {
    return new ProviderError("PROVIDER_UPSTREAM_FAILED", true, "Provider 上游服务暂时不可用。");
  }
  return new ProviderError("PROVIDER_REQUEST_REJECTED", false, "Provider 请求被拒绝。");
}
