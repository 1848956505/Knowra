import { createAiRecoveryScope, type AiRecoveryScope } from '../src/modules/ai/recovery-scope.js';
import {
  aiRuntimeLifecycle,
  type AiRuntimeLifecyclePorts,
  type AiRuntimeLifecycleOwner
} from '../src/modules/ai/runtime-lifecycle.js';

type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

declare const scope: AiRecoveryScope;
declare const thenable: PromiseLike<PromiseLike<number>>;
declare const unknownResult: unknown;
declare const impossibleResult: never;
const _literal = scope.run(() => 'ready' as const);
const _asynchronous = scope.run(async () => 42);
const _nested = scope.run(() => thenable);
const _unvalidated = scope.run(() => unknownResult);
const _impossible = scope.run(() => impossibleResult);
const _nullable = scope.run(() => null);
const _voidResult = scope.run(() => {});
const _stopping = scope.close(() => thenable);

export type RecoveryContracts = [
  Assert<Equal<ReturnType<typeof createAiRecoveryScope>, AiRecoveryScope>>,
  Assert<Equal<typeof _literal, Promise<'ready'>>>,
  Assert<Equal<typeof _asynchronous, Promise<number>>>,
  Assert<Equal<typeof _nested, Promise<number>>>,
  Assert<Equal<typeof _unvalidated, Promise<unknown>>>,
  Assert<Equal<typeof _impossible, Promise<never>>>,
  Assert<Equal<typeof _nullable, Promise<null>>>,
  Assert<Equal<typeof _voidResult, Promise<void>>>,
  Assert<Equal<typeof _stopping, Promise<void>>>,
  Assert<Equal<Pick<AiRecoveryScope, 'closed'>, { readonly closed: boolean }>>,
  Assert<undefined extends Parameters<AiRecoveryScope['run']>[0] ? false : true>
];

const _empty = aiRuntimeLifecycle({});
const _absent = aiRuntimeLifecycle();
const _nullRuntime = aiRuntimeLifecycle(null);
const _minimal = aiRuntimeLifecycle({
  attachments: { recover: () => thenable, close: () => unknownResult },
  conversationStore: { recoverInterrupted: () => 42 },
  agent: null,
  worker: { close: () => thenable }
});
const _customStages = _minimal.recover(new Set(['worker', 'unknown-stage']));
const _closeResult = _minimal.close();

export type LifecycleContracts = [
  Assert<Equal<typeof _empty, AiRuntimeLifecycleOwner>>,
  Assert<Equal<typeof _absent, AiRuntimeLifecycleOwner>>,
  Assert<Equal<typeof _nullRuntime, AiRuntimeLifecycleOwner>>,
  Assert<Equal<typeof _minimal, AiRuntimeLifecycleOwner>>,
  Assert<Equal<typeof _customStages, Promise<void>>>,
  Assert<Equal<typeof _closeResult, Promise<void>>>,
  Assert<readonly string[] extends NonNullable<Parameters<AiRuntimeLifecycleOwner['recover']>[0]> ? true : false>,
  Assert<string extends NonNullable<Parameters<AiRuntimeLifecycleOwner['recover']>[0]> ? true : false>,
  Assert<Set<string> extends NonNullable<Parameters<AiRuntimeLifecycleOwner['recover']>[0]> ? true : false>,
  Assert<number[] extends NonNullable<Parameters<AiRuntimeLifecycleOwner['recover']>[0]> ? false : true>,
  Assert<{ worker: { close: () => unknown } } extends AiRuntimeLifecyclePorts ? true : false>,
  Assert<{ worker: { close: string } } extends AiRuntimeLifecyclePorts ? false : true>,
  Assert<Equal<ReturnType<NonNullable<NonNullable<AiRuntimeLifecyclePorts['attachments']>['recover']>>, unknown>>
];
