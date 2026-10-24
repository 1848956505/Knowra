import {
  assertSpacesOwnedBy,
  resolveSingleOwnerId,
  assertPostgresOwnerBoundary
} from '../src/infrastructure/owner-boundary.ts';
import {
  assertSpacesOwnedBy as bridgeAssertSpacesOwnedBy,
  resolveSingleOwnerId as bridgeResolveSingleOwnerId,
  assertPostgresOwnerBoundary as bridgeAssertPostgresOwnerBoundary
} from '../src/infrastructure/owner-boundary.js';
import type {
  OwnerBoundarySpace,
  ResolveSingleOwnerOptions,
  PostgresOwnerBoundaryClient
} from '../src/infrastructure/owner-boundary.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type AssertResult = Assert<Equal<ReturnType<typeof assertSpacesOwnedBy>, string>>;
export type ResolveResult = Assert<Equal<ReturnType<typeof resolveSingleOwnerId>, string>>;
export type PostgresResult = Assert<Equal<ReturnType<typeof assertPostgresOwnerBoundary>, Promise<string>>>;
export type AssertArguments = Assert<
  Equal<Parameters<typeof assertSpacesOwnedBy>, [spaces: readonly OwnerBoundarySpace[] | undefined, ownerId: unknown]>
>;
export type ResolveArguments = Assert<
  Equal<Parameters<typeof resolveSingleOwnerId>, [options?: ResolveSingleOwnerOptions | undefined]>
>;
export type PostgresArguments = Assert<
  Equal<Parameters<typeof assertPostgresOwnerBoundary>, [client: PostgresOwnerBoundaryClient, ownerId: unknown]>
>;
export type SpaceId = Assert<Equal<OwnerBoundarySpace['id'], unknown>>;
export type SpaceOwner = Assert<Equal<OwnerBoundarySpace['userId'], unknown>>;
export type SpaceKeys = Assert<Equal<keyof OwnerBoundarySpace, 'id' | 'userId'>>;
export type SpaceReadonly = Assert<Equal<OwnerBoundarySpace, Readonly<OwnerBoundarySpace>>>;
export type ConfiguredOwner = Assert<Equal<ResolveSingleOwnerOptions['configuredOwnerId'], unknown>>;
export type FallbackOwner = Assert<Equal<ResolveSingleOwnerOptions['fallbackOwnerId'], unknown>>;
export type OptionSpaces = Assert<
  Equal<ResolveSingleOwnerOptions['spaces'], readonly OwnerBoundarySpace[] | undefined>
>;
export type OptionKeys = Assert<
  Equal<keyof ResolveSingleOwnerOptions, 'configuredOwnerId' | 'spaces' | 'fallbackOwnerId'>
>;
export type OptionsReadonly = Assert<Equal<ResolveSingleOwnerOptions, Readonly<ResolveSingleOwnerOptions>>>;
export type ClientKeys = Assert<Equal<keyof PostgresOwnerBoundaryClient, 'knowledgeSpace'>>;
export type DelegateKeys = Assert<Equal<keyof PostgresOwnerBoundaryClient['knowledgeSpace'], 'findMany'>>;
export type FindManyArguments = Assert<
  Equal<
    Parameters<PostgresOwnerBoundaryClient['knowledgeSpace']['findMany']>,
    [options: { select: { id: true; userId: true } }]
  >
>;
export type FindManyResult = Assert<
  Equal<
    ReturnType<PostgresOwnerBoundaryClient['knowledgeSpace']['findMany']>,
    readonly OwnerBoundarySpace[] | PromiseLike<readonly OwnerBoundarySpace[]>
  >
>;
export type BridgeAssert = Assert<Equal<typeof bridgeAssertSpacesOwnedBy, typeof assertSpacesOwnedBy>>;
export type BridgeResolve = Assert<Equal<typeof bridgeResolveSingleOwnerId, typeof resolveSingleOwnerId>>;
export type BridgePostgres = Assert<
  Equal<typeof bridgeAssertPostgresOwnerBoundary, typeof assertPostgresOwnerBoundary>
>;

const spaces: readonly OwnerBoundarySpace[] = Object.freeze([
  Object.freeze({ id: Symbol('id'), userId: 0 }),
  {},
  { userId: null },
  { id: undefined, userId: undefined }
]);
const readonlySpace: OwnerBoundarySpace = Object.freeze({ id: undefined, userId: Symbol('owner') });
assertSpacesOwnedBy(spaces, {
  toString() {
    return 'owner';
  }
});
assertSpacesOwnedBy([readonlySpace], Symbol('owner'));
assertSpacesOwnedBy(undefined, undefined);
assertSpacesOwnedBy([], 0);
assertSpacesOwnedBy([], false);
assertSpacesOwnedBy([], 1n);
assertSpacesOwnedBy([], null);
bridgeAssertSpacesOwnedBy([], {
  [Symbol.toPrimitive]() {
    return 'owner';
  }
});
resolveSingleOwnerId();
resolveSingleOwnerId(undefined);
const readonlyOptions: ResolveSingleOwnerOptions = Object.freeze({
  configuredOwnerId: false,
  spaces,
  fallbackOwnerId: 0
});
resolveSingleOwnerId(readonlyOptions);
resolveSingleOwnerId({ spaces: undefined, configuredOwnerId: undefined, fallbackOwnerId: undefined });
bridgeResolveSingleOwnerId({ configuredOwnerId: 1n, fallbackOwnerId: Symbol('fallback') });
const sync: PostgresOwnerBoundaryClient = {
  knowledgeSpace: {
    findMany(options) {
      const id: true = options.select.id;
      const userId: true = options.select.userId;
      void [id, userId];
      return spaces;
    }
  }
};
const asyncClient: PostgresOwnerBoundaryClient = {
  knowledgeSpace: {
    async findMany() {
      return spaces;
    }
  }
};
const thenable: PromiseLike<readonly OwnerBoundarySpace[]> = {
  then(onfulfilled, onrejected) {
    return Promise.resolve(spaces).then(onfulfilled, onrejected);
  }
};
const thenableClient: PostgresOwnerBoundaryClient = {
  knowledgeSpace: {
    findMany() {
      return thenable;
    }
  }
};
const frozenClient: PostgresOwnerBoundaryClient = Object.freeze({
  knowledgeSpace: Object.freeze({
    findMany() {
      return spaces;
    }
  })
});
assertPostgresOwnerBoundary(sync, null);
assertPostgresOwnerBoundary(asyncClient, 1);
assertPostgresOwnerBoundary(thenableClient, {});
bridgeAssertPostgresOwnerBoundary(frozenClient, undefined);

// 结构数组合同允许自有方法；不承诺每种合法改写都执行原生遍历或维持 owner 检查。
const ownMethods: OwnerBoundarySpace[] = [{ userId: 'foreign', id: 's' }];
ownMethods.map = () => [];
ownMethods.filter = () => [];
assertSpacesOwnedBy(ownMethods, 'owner');
resolveSingleOwnerId({ spaces: ownMethods });
assertPostgresOwnerBoundary(
  {
    knowledgeSpace: {
      findMany() {
        return ownMethods;
      }
    }
  },
  'owner'
);
// readonly 是输入视图，不冻结原始实体；成功也不把未知字段细化为 DTO。
const mutableSpace = { id: 1, userId: 'owner' };
assertSpacesOwnedBy([mutableSpace], 'owner');
mutableSpace.userId = 'later owner';
