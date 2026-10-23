/**
 * 以下私有视图只表达原 JS 已执行的属性读取、方法调用和比较操作，不是输入验证。
 * getter 可在两次读取间变化，调用仍可能原生抛错；自定义返回值始终保持 unknown。
 */
type JsonProperties = Record<PropertyKey, unknown>;
type JsonArrayProperties = { length: unknown; [index: number]: unknown };
type ToJsonOperation = { toJSON: (key: string) => unknown };
type ValueOfOperation = { valueOf: () => unknown };
type RawJsonOperation = { isRawJSON?: (value: unknown) => unknown };
type JsonChunkIterator = Generator<string | undefined, void, unknown>;

// 与 JSON.stringify(value, null, 2) 保持相同布局；每次只构造一个标量字符串。
// 持久化资料使用普通 JSON 记录，也兼容 Date、包装值、空洞及 toJSON。
// 原生 stringify 可能再次调用自定义 BigInt.toJSON 并产出 undefined；不可承诺全为字符串。
export function* jsonChunks(value: unknown): JsonChunkIterator {
  const ancestors = new Set<object>();
  function normalize(input: unknown, key: string): unknown {
    if (
      input !== null &&
      ['object', 'bigint'].includes(typeof input) &&
      typeof (input as JsonProperties).toJSON === 'function'
    )
      input = (input as ToJsonOperation).toJSON(key);
    if (
      input instanceof Number ||
      input instanceof String ||
      input instanceof Boolean ||
      Object.prototype.toString.call(input) === '[object BigInt]'
    )
      input = (input as ValueOfOperation).valueOf();
    return input;
  }
  const omitted = (input: unknown) => input === undefined || ['function', 'symbol'].includes(typeof input);
  function* encode(input: unknown, depth: number, key: string): JsonChunkIterator {
    input = normalize(input, key);
    if (omitted(input)) return;
    yield* encodeNormalized(input, depth);
  }
  function* encodeNormalized(input: unknown, depth: number): JsonChunkIterator {
    if (input === null || typeof input !== 'object' || (JSON as typeof JSON & RawJsonOperation).isRawJSON?.(input)) {
      yield JSON.stringify(input);
      return;
    }
    if (ancestors.has(input)) throw new TypeError('Converting circular structure to JSON');
    ancestors.add(input);
    const array = Array.isArray(input),
      indent = '  '.repeat(depth + 1);
    yield array ? '[' : '{';
    let count = 0;
    if (array) {
      const length = (input as JsonArrayProperties).length;
      // Proxy 的 length 可为未知值；仅在原比较处提供可擦除视图，不缓存转换或宣称其为数字。
      for (let i = 0; i < (length as number); i++) {
        yield `${count++ ? ',' : ''}\n${indent}`;
        const child = normalize((input as JsonArrayProperties)[i], String(i));
        if (omitted(child)) yield 'null';
        else yield* encodeNormalized(child, depth + 1);
      }
    } else {
      for (const key of Object.keys(input)) {
        const child = normalize((input as JsonProperties)[key], key);
        if (omitted(child)) continue;
        yield `${count++ ? ',' : ''}\n${indent}${JSON.stringify(key)}: `;
        yield* encodeNormalized(child, depth + 1);
      }
    }
    if (count) yield `\n${'  '.repeat(depth)}`;
    yield array ? ']' : '}';
    ancestors.delete(input);
  }
  yield* encode(value, 0, '');
}
