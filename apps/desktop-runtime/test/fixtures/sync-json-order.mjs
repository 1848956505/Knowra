// 模拟 JSONB 回读的对象键序；不改变数组顺序或字段值，不代替真实 PG 验收。
export function reorderJsonObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reorderJsonObjectKeys);
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value).sort((left, right) => Buffer.byteLength(left) - Buffer.byteLength(right)
    || Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return Object.fromEntries(keys.map(key => [key, reorderJsonObjectKeys(value[key])]));
}
