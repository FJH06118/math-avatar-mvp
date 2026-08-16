export interface MockRequestOptions {
  signal?: AbortSignal;
  /**
   * 测试专用失败注入。未来替换真实接口时可删除，不影响业务参数。
   */
  fail?: boolean;
}
