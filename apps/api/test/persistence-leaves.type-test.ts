import { createJsonlShadowSink, type JsonlShadowSinkOptions } from '../src/infrastructure/annotation-shadow-log.ts';
import { createJsonlShadowSink as bridgeSink } from '../src/infrastructure/annotation-shadow-log.js';
import { PERSISTENCE_TRANSACTION_ACTIVE } from '../src/infrastructure/transaction-context.ts';
import { PERSISTENCE_TRANSACTION_ACTIVE as bridgeToken } from '../src/infrastructure/transaction-context.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type SinkParameter = Assert<Equal<Parameters<ReturnType<typeof createJsonlShadowSink>>, [entry: unknown]>>;
export type SinkReturn = Assert<Equal<ReturnType<ReturnType<typeof createJsonlShadowSink>>, void>>;
export type PathParameter = Assert<Equal<Parameters<typeof createJsonlShadowSink>[0], string>>;
export type OptionsParameter = Assert<
  Equal<Parameters<typeof createJsonlShadowSink>[1], JsonlShadowSinkOptions | undefined>
>;
export type Threshold = Assert<Equal<JsonlShadowSinkOptions['maxBytes'], number | undefined>>;
export type BridgeSink = Assert<Equal<typeof bridgeSink, typeof createJsonlShadowSink>>;
export type BridgeToken = Assert<Equal<typeof bridgeToken, typeof PERSISTENCE_TRANSACTION_ACTIVE>>;
export type UniqueNotGeneral = Assert<
  Equal<symbol extends typeof PERSISTENCE_TRANSACTION_ACTIVE ? true : false, false>
>;
const entry: unknown = Symbol('accepted');
const sink = createJsonlShadowSink('/compile-only');
createJsonlShadowSink('/compile-only', undefined);
createJsonlShadowSink('/compile-only', {});
createJsonlShadowSink('/compile-only', { maxBytes: undefined });
createJsonlShadowSink('/compile-only', { maxBytes: NaN });
createJsonlShadowSink('/compile-only', { maxBytes: Infinity });
const options: JsonlShadowSinkOptions = { maxBytes: -1 };
createJsonlShadowSink('/compile-only', options);
const result: void = sink(entry);
const narrow: (entry: { noteId: string }) => void = sink;
const record = { [PERSISTENCE_TRANSACTION_ACTIVE]: true };
const bridgeAccess: boolean = record[bridgeToken];
export type OnlyUniqueKey = Assert<Equal<keyof typeof record, typeof PERSISTENCE_TRANSACTION_ACTIVE>>;
void [result, narrow, bridgeAccess];
