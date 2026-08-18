const PROVIDER_ACTION_CODES = new Set([
  "AGENT_CONFIG_MISSING",
  "AGENT_SECRET_UNAVAILABLE",
  "AGENT_AUTH_FAILED",
  "AGENT_RATE_LIMITED",
  "AGENT_TIMEOUT",
  "AGENT_UPSTREAM_FAILED",
  "AGENT_REQUEST_REJECTED",
  "AGENT_CONNECTION_FAILED",
  "AGENT_RESPONSE_INVALID",
  "AGENT_OUTPUT_INVALID",
  "AGENT_PROVIDER_FAILED",
]);

export function planFailureNeedsProviderCheck(
  errorCode: string | null | undefined,
  legacyErrorMessage?: string | null,
): boolean {
  if (
    errorCode === "AGENT_PROVIDER_FAILED" &&
    legacyErrorMessage === "课程规划服务暂时不可用。"
  ) return false;
  return Boolean(errorCode && PROVIDER_ACTION_CODES.has(errorCode));
}

export function planFailureMessage(
  errorCode: string | null | undefined,
  legacyErrorMessage?: string | null,
): string {
  if (errorCode === "AGENT_PROVIDER_FAILED") {
    if (legacyErrorMessage === "课程规划服务暂时不可用。") {
      return "本地课程规划组件执行失败。请重启桌面软件后重试规划。";
    }
    if (legacyErrorMessage === "Provider 服务连接失败。") {
      return "Provider 连接失败。请检查网络、代理和 API 地址，重新测试连接后重试规划。";
    }
  }
  switch (errorCode) {
    case "AGENT_CONFIG_MISSING":
      return "Provider 未配置、已停用或配置已变化。请检查默认 Provider，重新测试连接后重试规划。";
    case "AGENT_SECRET_UNAVAILABLE":
      return "Windows 安全密钥存储暂时不可用。请重启桌面软件，重新测试 Provider 后重试规划。";
    case "AGENT_AUTH_FAILED":
      return "Provider 拒绝了当前密钥。请更新 API Key，重新测试连接后重试规划。";
    case "AGENT_CONNECTION_FAILED":
      return "Provider 连接失败。请检查网络、代理和 API 地址，重新测试连接后重试规划。";
    case "AGENT_TIMEOUT":
      return "Provider 请求超时。请检查网络或代理，重新测试连接后重试规划。";
    case "AGENT_RATE_LIMITED":
      return "Provider 当前限流。请稍后重新测试连接，再重试规划。";
    case "AGENT_UPSTREAM_FAILED":
      return "Provider 上游服务暂时不可用。请稍后重新测试连接，再重试规划。";
    case "AGENT_REQUEST_REJECTED":
      return "Provider 拒绝了规划请求。请检查 API 地址和模型名称，重新测试连接后重试规划。";
    case "AGENT_RESPONSE_INVALID":
      return "Provider 返回了无法识别的响应。请检查协议和模型兼容性，重新测试连接后重试规划。";
    case "AGENT_OUTPUT_INVALID":
      return "Provider 已响应，但讲稿未通过结构校验。请检查模型兼容性后显式重试规划。";
    case "AGENT_RUNTIME_FAILED":
      return "本地课程规划组件执行失败。请重启桌面软件后重试规划。";
    case "PLAN_RETRY_REQUIRES_USER":
      return "上次规划在结果确认前中断。为避免重复调用 Provider，请显式重试规划。";
    case "AGENT_PROVIDER_FAILED":
      return "Provider 调用失败。请重新测试连接，确认通过后重试规划。";
    default:
      return "规划任务失败，未生成任何讲稿。请重启桌面软件后重试规划；若持续失败，请保留诊断报告。";
  }
}

export function planIdempotencyKey(
  presentationId: string,
  failedTaskId?: string,
): string {
  const prefix = failedTaskId ? "plan_retry_" : "plan_initial_";
  const source = failedTaskId ?? presentationId;
  const compact = source.length <= 100
    ? source
    : `${source.slice(0, 16)}_${source.slice(-80)}`;
  return `${prefix}${compact}`;
}
