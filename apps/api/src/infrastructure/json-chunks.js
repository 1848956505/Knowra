// 与 JSON.stringify(value, null, 2) 保持相同布局；每次只构造一个标量字符串。
// 持久化资料使用普通 JSON 记录，也兼容 Date、包装值、空洞及 toJSON。
export function* jsonChunks(value) {
  const ancestors = new Set();
  function normalize(input, key) {
    if (input !== null && ['object', 'bigint'].includes(typeof input) && typeof input.toJSON === 'function') input = input.toJSON(key);
    if (input instanceof Number || input instanceof String || input instanceof Boolean || Object.prototype.toString.call(input) === '[object BigInt]') input = input.valueOf();
    return input;
  }
  const omitted = input => input === undefined || ['function', 'symbol'].includes(typeof input);
  function* encode(input, depth, key) {
    input = normalize(input, key);
    if (omitted(input)) return;
    yield* encodeNormalized(input, depth);
  }
  function* encodeNormalized(input, depth) {
    if (input === null || typeof input !== 'object' || JSON.isRawJSON?.(input)) {
      yield JSON.stringify(input); return;
    }
    if (ancestors.has(input)) throw new TypeError('Converting circular structure to JSON');
    ancestors.add(input);
    const array = Array.isArray(input), indent = '  '.repeat(depth + 1);
    yield array ? '[' : '{';
    let count = 0;
    if (array) {
      const length = input.length;
      for (let i = 0; i < length; i++) {
        yield `${count++ ? ',' : ''}\n${indent}`;
        const child = normalize(input[i], String(i));
        if (omitted(child)) yield 'null';
        else yield* encodeNormalized(child, depth + 1);
      }
    } else {
      for (const key of Object.keys(input)) {
        const child = normalize(input[key], key);
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
