/** 有界 JSON 契约；不依赖 Node、DOM、框架或 IO。限制按 UTF-16 字符计，文件按 UTF-8 字节计。 */
export const REVIEW_LIMITS = Object.freeze({ bytes: 1024 * 1024, rows: 100, proposals: 200,
  concepts: 200, items: 1000, id: 128, title: 160, name: 80, sense: 240,
  note: 32768, text: 8192, statement: 1200, sourceIssue: 200, rawText: 65536, depth: 24, nodes: 50000, linksPerRow: 20, simulationWork: 2000000, similarityWork: 10000000 });
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
export class ReviewContractError extends Error {
  constructor(path, code) { super(`${path}: ${code}`); this.name = 'ReviewContractError'; this.path = path; this.code = code; }
}
export const fail = (path, code) => { throw new ReviewContractError(path, code); };
export const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export function keys(value, expected, path) {
  if (!record(value) || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) fail(path, 'fields');
}
export function text(value, max, path, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(path, 'text');
}
export function id(value, path) {
  text(value, REVIEW_LIMITS.id, path);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) || forbidden.has(value)) fail(path, 'id');
}
export function list(value, max, path) { if (!Array.isArray(value) || value.length > max) fail(path, 'array'); }
export function choice(value, values, path) { if (!values.includes(value)) fail(path, 'enum'); }
export function unique(values, path) { if (new Set(values).size !== values.length) fail(path, 'duplicate'); }
export const same = (a, b) => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  return record(a) && record(b) && Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
};
/** 也检查对象调用者，拒绝循环、getter、非 JSON 值和危险键。异常不回显正文。 */
export function boundedJson(value) {
  const stack = [{ value, depth: 0 }]; let scheduled = 1; let bytes = 0;
  const seen = new Set(); const encoder = new TextEncoder();
  const add = amount => { bytes += amount; if (bytes > REVIEW_LIMITS.bytes) fail('$', 'size'); };
  const stringBytes = value => { text(value, REVIEW_LIMITS.rawText, '$', true); return encoder.encode(JSON.stringify(value)).byteLength; };
  while (stack.length) {
    const { value: v, depth } = stack.pop();
    if (depth > REVIEW_LIMITS.depth) fail('$', 'complexity');
    if (v === null || typeof v === 'boolean') { add(v === null || v === true ? 4 : 5); continue; }
    if (typeof v === 'number') { if (!Number.isFinite(v)) fail('$', 'json-number'); add(String(v).length); continue; }
    if (typeof v === 'string') { add(stringBytes(v)); continue; }
    const array = Array.isArray(v);
    if (!array && !record(v)) fail('$', 'json-type');
    if (seen.has(v)) fail('$', 'shared-or-cyclic-object'); seen.add(v);
    // 先拦截稀疏/超大数组，再列举属性；不能等 stringify 分配后才拒绝。
    if (array && (Object.getPrototypeOf(v) !== Array.prototype || v.length > REVIEW_LIMITS.nodes)) fail('$', 'array-complexity');
    const ownKeys = Reflect.ownKeys(v);
    if (ownKeys.length > REVIEW_LIMITS.nodes) fail('$', 'complexity');
    if (array && ownKeys.length !== v.length + 1) fail('$', 'sparse-or-decorated-array');
    add(2 + Math.max(0, ownKeys.length - (array ? 1 : 0) - 1));
    for (const key of ownKeys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (typeof key !== 'string' || forbidden.has(key) || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('$', 'unsafe-key');
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= v.length)) fail('$', 'array-key');
      if (!array) add(stringBytes(key) + 1);
      if (++scheduled > REVIEW_LIMITS.nodes || depth + 1 > REVIEW_LIMITS.depth) fail('$', 'complexity');
      stack.push({ value: descriptor.value, depth: depth + 1 });
    }
  }
}

export function parseJson(input) {
  if (typeof input !== 'string' || input.length > REVIEW_LIMITS.bytes
    || new TextEncoder().encode(input).byteLength > REVIEW_LIMITS.bytes) fail('$', 'size');
  let value; try { value = JSON.parse(input); } catch { fail('$', 'json'); }
  boundedJson(value); return value;
}
export const clone = value => JSON.parse(JSON.stringify(value));
