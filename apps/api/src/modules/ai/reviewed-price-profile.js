// 2026-09-27 核对 DeepSeek 中文价格页的高峰时段、缓存未命中价格。
// 低峰与缓存命中仍按此较高档预留；过期后停止付费调用，须重新核价发布。
export const reviewedDeepSeekPriceProfile = Object.freeze({
  version: 'deepseek-flash-cny-2026-09-27',
  modelId: 'deepseek-flash',
  expiresAt: '2026-10-05T00:00:00.000Z',
  inputMicrounitsPerMillion: 2_000_000,
  outputMicrounitsPerMillion: 8_000_000
});
