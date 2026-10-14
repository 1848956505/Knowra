import assert from 'node:assert/strict';

export const CORE_HTTP_SAMPLE_COUNT = 40;
export const CORE_HTTP_WARMUP_COUNT = 3;
/** nearest-rank p95；40 个样本避免把 8 次中的最大值称作 p95。 */
export function p95(samples) {
  assert(samples.length >= CORE_HTTP_SAMPLE_COUNT, 'p95 至少需要 40 个完整样本');
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * .95) - 1];
}
