import { jsonChunks } from '../src/infrastructure/json-chunks.ts';
import { jsonChunks as bridge } from '../src/infrastructure/json-chunks.js';
import { writeJsonFileAtomically } from '../src/infrastructure/atomic-json-file.js';
import { createFileDataStore } from '../src/infrastructure/file-data-store.js';
import { createAttachmentCleanupQueue } from '../src/infrastructure/attachment-cleanup-queue.js';
import { createAppContext } from '../src/app.factory.js';
import { createPostgresAppContext } from '../src/postgres-app.factory.js';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;
type Output = ReturnType<typeof jsonChunks>;
type Yield = Output extends Generator<infer Value, void, unknown> ? Value : never;
type Completion = Output extends Generator<unknown, infer Value, unknown> ? Value : never;
type Resume = Output extends Generator<unknown, void, infer Value> ? Value : never;
declare const opaque: unknown;
const _output = jsonChunks(opaque);
const _bridge = bridge(opaque);
const _ordinary = jsonChunks({ rows: [{ id: 'row', active: true }], date: new Date() });
const _custom = jsonChunks({ toJSON: () => opaque, valueOf: () => opaque });
const _nullable = jsonChunks(undefined);
const _symbol = jsonChunks(Symbol('value'));
const _bigint = jsonChunks(1n);
const _chunks = [..._output];
const _next = _bridge.next(opaque);
const _callback: (value: unknown) => Generator<string | undefined, void, unknown> = jsonChunks;
const _iterable: Iterable<string | undefined> = bridge(opaque);

// 真实装配入口可继续使用；旧 JS 函数体未纳入 strict，不代表持久化端到端安全。
writeJsonFileAtomically('/compile-only/not-executed.json', opaque);
const _store = createFileDataStore('/compile-only/not-executed.json');
const _queue = createAttachmentCleanupQueue({ storageRootDir: '/compile-only', fileManager: {} });
const _local = createAppContext();
const _postgres = createPostgresAppContext();

export type JsonChunksContracts = [
  Assert<Equal<Parameters<typeof jsonChunks>, [value: unknown]>>,
  Assert<Equal<Parameters<typeof bridge>, [value: unknown]>>,
  Assert<Equal<Output, Generator<string | undefined, void, unknown>>>,
  Assert<Equal<ReturnType<typeof bridge>, Output>>,
  Assert<Equal<Yield, string | undefined>>,
  Assert<Equal<Completion, void>>,
  Assert<Equal<Resume, unknown>>,
  Assert<Equal<IsAny<Parameters<typeof jsonChunks>[0]>, false>>,
  Assert<Equal<IsAny<Yield>, false>>,
  Assert<Equal<IsAny<Output>, false>>,
  Assert<Equal<IsAny<Completion>, false>>,
  Assert<Equal<IsAny<Resume>, false>>,
  Assert<Equal<typeof _output, Output>>,
  Assert<Equal<typeof _bridge, Output>>,
  Assert<Equal<typeof _ordinary, Output>>,
  Assert<Equal<typeof _custom, Output>>,
  Assert<Equal<typeof _nullable, Output>>,
  Assert<Equal<typeof _symbol, Output>>,
  Assert<Equal<typeof _bigint, Output>>,
  Assert<Equal<typeof _chunks, (string | undefined)[]>>,
  Assert<Equal<typeof _next, IteratorResult<string | undefined, void>>>,
  Assert<Equal<ReturnType<typeof writeJsonFileAtomically>, void>>
];

for (const chunk of jsonChunks(opaque)) {
  if (typeof chunk === 'string') {
    const _length: number = chunk.length;
    const _text: string = chunk;
    void [_length, _text];
  } else {
    const _omittedNativeResult: undefined = chunk;
    void _omittedNativeResult;
  }
}
void [_callback, _iterable, _store, _queue, _local, _postgres];
