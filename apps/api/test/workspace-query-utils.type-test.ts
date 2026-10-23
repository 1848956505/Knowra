import {
  parseWorkspaceQuery,
  paginateWorkspaceItems,
  countBy,
  groupBy,
  matchesText,
  summarizeEvidenceStatus,
  summarizeSourceStatus,
  encodeWorkspaceCursor,
  type WorkspaceQueryInput,
  type WorkspaceCounts,
  type WorkspaceCursor,
  type WorkspaceRecord,
  type WorkspacePageQuery,
  type WorkspaceReduce,
  type WorkspaceSome,
  type WorkspaceStatusRecords
} from '../src/modules/knowledge/application/workspace-query-utils.ts';
import { KnowledgeItem } from '../src/modules/knowledge/domain/knowledge-item.ts';
import { createInMemoryKnowledgeItemRepository } from '../src/modules/knowledge/infrastructure/knowledge-item-repository.ts';
import { createInMemoryLearningObjectiveRepository } from '../src/modules/knowledge/infrastructure/assessment-repository.ts';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

const _defaultQuery = parseWorkspaceQuery();
const _query = parseWorkspaceQuery({
  limit: 1n,
  query: Symbol(),
  kind: { legacy: true },
  cursor: false,
  sourceStatus: 0,
  includeArchived: 'true'
});
const rows = [
  { id: 'a', updatedAt: new Date(), extra: 42 },
  { id: 'b', updatedAt: new Date(), extra: 17 }
];
const _page = paginateWorkspaceItems(new Set(rows), _query);
const _counts = countBy(rows, item => item.extra);
const _groups = groupBy(rows, item => item.extra);
// 直接属性表达式才能捕获 Object 内建成员误推断；仅索引访问类型不足以覆盖该漏洞。
const _countMember0 = _counts.constructor;
const _countMember1 = _counts.toString;
const _countMember2 = _counts.toLocaleString;
const _countMember3 = _counts.valueOf;
const _countMember4 = _counts.hasOwnProperty;
const _countMember5 = _counts.isPrototypeOf;
const _countMember6 = _counts.propertyIsEnumerable;
const _countMember7 = _counts.__proto__;

const _customCount = countBy(
  {
    reduce: (_callback: (accumulator: WorkspaceCounts, item: number) => WorkspaceCounts) => Promise.resolve('arbitrary')
  },
  item => item
);
const _customGroup = groupBy(
  { reduce: (_callback: (accumulator: Map<string, number[]>, item: number) => Map<string, number[]>) => false },
  item => String(item)
);
const _customSome = matchesText({ some: callback => ({ matched: callback('needle') }) }, 'needle');
const _normalSome = matchesText(['Needle', undefined, 42], 'needle');
const _evidence = summarizeEvidenceStatus([{ status: { legacy: true } }]);
const _sources = summarizeSourceStatus([{ status: Symbol() }]);
const _customStatus = summarizeEvidenceStatus({
  map: project => ({ includes: () => project({ status: 42 }), length: { legacy: true } })
});
const _encoded = encodeWorkspaceCursor({ id: Symbol(), updatedAt: 1n });
const _emptyEncoded = encodeWorkspaceCursor({});
const _defaultSources = summarizeSourceStatus();
const _defaultEvidence = summarizeEvidenceStatus();
const _rawPage = paginateWorkspaceItems([{ id: { legacy: true }, updatedAt: Symbol() }], _defaultQuery);

const domainItem = new KnowledgeItem({ id: 'item' });
const knowledgeRepository = createInMemoryKnowledgeItemRepository();
knowledgeRepository.save(domainItem);
const _repositoryPage = paginateWorkspaceItems(knowledgeRepository.list(), _defaultQuery);
const objectiveRepository = createInMemoryLearningObjectiveRepository();
const _repositoryGroups = groupBy(objectiveRepository.list(), item => item.knowledgeItemId);
const _repositoryCounts = countBy(objectiveRepository.list(), item => item.reviewStatus);
const _repositoryStatuses = summarizeEvidenceStatus(
  objectiveRepository.list().map(item => ({ status: item.reviewStatus }))
);

const _parseContract: (input?: WorkspaceQueryInput) => { limit: number; sort: string; cursor: WorkspaceCursor | null } =
  parseWorkspaceQuery;
const _countContract: (rows: readonly WorkspaceRecord[], select: (row: WorkspaceRecord) => unknown) => WorkspaceCounts =
  countBy;
const _groupContract: (
  rows: readonly WorkspaceRecord[],
  select: (row: WorkspaceRecord) => unknown
) => Map<unknown, WorkspaceRecord[]> = groupBy;
const _pageContract: (rows: Iterable<WorkspaceRecord>, query: WorkspacePageQuery) => { items: WorkspaceRecord[] } =
  paginateWorkspaceItems;
const _someContract: (values: WorkspaceSome, query: unknown) => boolean = matchesText;
const _readonlyGroup = groupBy([{ id: 'x' }] as const, item => item.id);
const _readonlyCount = countBy([{ id: 'x' }] as const, item => item.id);
const _statusContract: (records?: WorkspaceStatusRecords) => 'invalid' | 'stale' | 'insufficient' | 'valid' =
  summarizeEvidenceStatus;
const _customPort: WorkspaceReduce<string, WorkspaceCounts, number> = {
  reduce: callback => {
    callback({}, 'x');
    return 1;
  }
};
const _customPortResult = countBy(_customPort, item => item.length);

export type WorkspaceQueryAssertions = [
  Assert<Equal<typeof _defaultQuery.limit, number>>,
  Assert<Equal<typeof _defaultQuery.sort, string>>,
  Assert<Equal<typeof _defaultQuery.cursor, WorkspaceCursor | null>>,
  Assert<Equal<typeof _defaultQuery.hasQuestions, boolean | null>>,
  Assert<Equal<typeof _defaultQuery.knowledgeType, string | null>>,
  Assert<Equal<typeof _page.items, typeof rows>>,
  Assert<Equal<typeof _page.pagination.nextCursor, string | null>>,
  Assert<Equal<typeof _counts, WorkspaceCounts>>,
  Assert<Equal<(typeof _counts)[string], unknown>>,
  Assert<Equal<typeof _countMember0, unknown>>,
  Assert<Equal<typeof _countMember1, unknown>>,
  Assert<Equal<typeof _countMember2, unknown>>,
  Assert<Equal<typeof _countMember3, unknown>>,
  Assert<Equal<typeof _countMember4, unknown>>,
  Assert<Equal<typeof _countMember5, unknown>>,
  Assert<Equal<typeof _countMember6, unknown>>,
  Assert<Equal<typeof _countMember7, unknown>>,
  Assert<Equal<IsAny<(typeof _counts)[symbol]>, false>>,
  Assert<Equal<typeof _groups, Map<number, typeof rows>>>,
  Assert<Equal<typeof _customCount, Promise<string>>>,
  Assert<Equal<typeof _customGroup, boolean>>,
  Assert<Equal<typeof _customSome, { matched: boolean } | true>>,
  Assert<Equal<typeof _normalSome, boolean>>,
  Assert<Equal<typeof _evidence, 'invalid' | 'stale' | 'insufficient' | 'valid'>>,
  Assert<Equal<typeof _sources, 'stale' | 'insufficient' | 'valid'>>,
  Assert<Equal<typeof _customStatus, typeof _evidence>>,
  Assert<Equal<typeof _encoded, string>>,
  Assert<Equal<typeof _emptyEncoded, string>>,
  Assert<Equal<(typeof _rawPage.items)[number]['id'], { legacy: boolean }>>,
  Assert<Equal<(typeof _rawPage.items)[number]['updatedAt'], symbol>>,
  Assert<Equal<typeof _repositoryCounts, WorkspaceCounts>>,
  Assert<Equal<typeof _customPortResult, number>>,
  Assert<Equal<ReturnType<typeof countBy>, unknown>>,
  Assert<Equal<ReturnType<typeof groupBy>, unknown>>,
  Assert<Equal<ReturnType<typeof matchesText>, unknown>>,
  Assert<Equal<Parameters<typeof parseWorkspaceQuery>, [input?: WorkspaceQueryInput]>>,
  Assert<Equal<WorkspaceRecord['id'], unknown>>,
  Assert<Equal<WorkspaceRecord['updatedAt'], unknown>>,
  Assert<Equal<WorkspaceQueryInput['limit'], unknown>>,
  Assert<Equal<IsAny<ReturnType<typeof countBy>>, false>>
];
void [
  _parseContract,
  _countContract,
  _groupContract,
  _pageContract,
  _someContract,
  _readonlyGroup,
  _readonlyCount,
  _statusContract,
  _repositoryPage,
  _repositoryGroups,
  _repositoryStatuses,
  _defaultSources,
  _defaultEvidence
];
