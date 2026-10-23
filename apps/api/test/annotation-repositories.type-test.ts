import {
  createInMemoryContentAnnotationRepository,
  type ContentAnnotationRecord,
  type NormalizedContentAnnotationRecord,
  type ContentAnnotationRepository
} from '../src/modules/knowledge/infrastructure/content-annotation-repository.ts';
import { createInMemoryContentAnnotationRepository as contentBridge } from '../src/modules/knowledge/infrastructure/content-annotation-repository.js';
import {
  createInMemoryAnnotationExclusionRepository,
  createInMemoryAnnotationRevisionRepository,
  createInMemoryAnalysisScopeRepository,
  type AnnotationExclusionRecord,
  type AnnotationRevisionRecord,
  type AnalysisScopeRecord
} from '../src/modules/knowledge/infrastructure/annotation-support-repositories.ts';
import { createInMemoryAnnotationRevisionRepository as revisionBridge } from '../src/modules/knowledge/infrastructure/annotation-support-repositories.js';
import { ContentAnnotation } from '../src/modules/knowledge/domain/content-annotation.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type ContractAssertions = [
  Assert<Equal<typeof createInMemoryContentAnnotationRepository, typeof contentBridge>>,
  Assert<Equal<typeof createInMemoryAnnotationRevisionRepository, typeof revisionBridge>>,
  Assert<Equal<ContentAnnotationRecord['revision'], unknown>>,
  Assert<Equal<ContentAnnotationRecord['anchor'], unknown>>,
  Assert<Equal<ContentAnnotationRecord['status'], unknown>>,
  Assert<Equal<ContentAnnotationRecord['updatedAt'], unknown>>,
  Assert<Equal<ContentAnnotationRecord['schemaVersion'], unknown>>,
  Assert<Equal<NormalizedContentAnnotationRecord['scopeType'], unknown>>,
  Assert<Equal<NormalizedContentAnnotationRecord['revision'], unknown>>,
  Assert<Equal<NormalizedContentAnnotationRecord['lifecycleStatus'], unknown>>,
  Assert<Equal<NormalizedContentAnnotationRecord['anchorStatus'], unknown>>,
  Assert<Equal<AnnotationExclusionRecord['status'], unknown>>,
  Assert<Equal<AnnotationRevisionRecord['revision'], unknown>>,
  Assert<Equal<AnalysisScopeRecord['deletedAt'], unknown>>,
  Assert<Equal<ReturnType<ContentAnnotationRepository['save']>, ContentAnnotationRecord>>,
  Assert<Equal<ReturnType<ContentAnnotationRepository['findById']>, NormalizedContentAnnotationRecord | null>>,
  Assert<Equal<ReturnType<ContentAnnotationRepository['findDuplicate']>, NormalizedContentAnnotationRecord | null>>,
  Assert<Equal<ReturnType<ContentAnnotationRepository['list']>, NormalizedContentAnnotationRecord[]>>,
  Assert<Equal<ReturnType<ContentAnnotationRepository['deleteByNoteIds']>, ContentAnnotationRecord[]>>,
  Assert<Equal<ReturnType<ContentAnnotationRepository['markStaleByNoteId']>, ContentAnnotationRecord[]>>
];

const legacy = {
  id: Symbol('legacy'),
  noteId: 7n,
  revision: { valueOf: () => 3 },
  status: 'active' as const,
  extra: 5
};
const content = createInMemoryContentAnnotationRepository({
  records: [legacy],
  onChange(rows) {
    rows.push({ id: 'new', revision: Symbol() });
  }
});
const saved = content.save(legacy);
const normalized = content.findById(legacy.id);
const changed = content.markStaleByNoteId(legacy.noteId, {});
content.findByIdempotencyKey({}, null);
content.findDuplicate({ noteId: false, anchorFingerprint: [], scopeType: Symbol() });
content.list({ noteId: 0, spaceId: '', kind: null, includeDeleted: 'false', anchorStatus: {} });
content.deleteByNoteIds(new Set([Symbol(), undefined, null]));
content.deleteByNoteIds('abc');
content.deleteByNoteIds(null);
content.deleteByNoteIds(undefined);
createInMemoryContentAnnotationRepository({ records: null }).save({ id: 'a', arbitraryHistory: 7 });
createInMemoryContentAnnotationRepository().save(
  new ContentAnnotation({
    id: 'a',
    spaceId: 's',
    noteId: 'n',
    quoteText: 'text',
    fromPosition: 0,
    toPosition: 4,
    anchorFingerprint: 'f',
    noteContentHash: 'h',
    idempotencyKey: 'k'
  })
);
export type NoFalseLiteralPromises = [
  Assert<Equal<typeof saved.status, unknown>>,
  Assert<Equal<(typeof changed)[number]['revision'], unknown>>,
  Assert<Equal<(typeof changed)[number]['anchorStatus'], unknown>>
];
if (normalized) {
  // @ts-expect-error 归一化没有验证历史 revision，也不保留原数字字面量。
  const revision: number = normalized.revision;
  // @ts-expect-error 浅拷贝没有保留原始实例/附加字段的泛型承诺。
  const original: typeof legacy = normalized;
  void [revision, original];
}
// @ts-expect-error 原地陈旧化后不承诺 status 仍是调用前的 active。
const active: 'active' = saved.status;
// @ts-expect-error 返回历史读取视图不是已验证的领域实例。
const model: ContentAnnotation = saved;
// @ts-expect-error 本地 API 同步返回数组。
content.list().then(() => {});
// @ts-expect-error 构造参数不接受 null，保留原参数访问异常。
createInMemoryContentAnnotationRepository(null);
// @ts-expect-error 批量删除需要 Set 构造器支持的迭代输入。
content.deleteByNoteIds(42);

const revisionRow = { id: 'r', annotationId: Symbol(), revision: 3n, extra: { retained: true } };
const revisions = createInMemoryAnnotationRevisionRepository({ records: [revisionRow] });
const revisionSaved = revisions.save(revisionRow);
const revisionFound = revisions.findByAnnotationRevision(revisionRow.annotationId, 3n);
const revisionList = revisions.list({ annotationId: false });
const revisionDeleted = revisions.deleteByAnnotationIds(new Set([revisionRow.annotationId]));
const revisionSingleDeleted = revisions.delete('r');
export type SupportIdentityAssertions = [
  Assert<Equal<typeof revisionSaved, typeof revisionRow>>,
  Assert<Equal<typeof revisionFound, typeof revisionRow | null>>,
  Assert<Equal<typeof revisionList, (typeof revisionRow)[]>>,
  Assert<Equal<typeof revisionDeleted, (typeof revisionRow | null | undefined)[]>>,
  Assert<Equal<typeof revisionSingleDeleted, typeof revisionRow | null | undefined>>
];
// @ts-expect-error 回调可能改变后续删除目标，批量结果不能承诺全为记录。
const allDeleted: (typeof revisionRow)[] = revisionDeleted;
// @ts-expect-error 特定行形状的仓库不接受缺少 extra 的新记录。
revisions.save({ id: 'r', annotationId: Symbol(), revision: 1n });
const exclusions = createInMemoryAnnotationExclusionRepository({
  records: [{ id: 'e', parentAnnotationId: null, status: { legacy: true }, extra: 3 }]
});
const exclusionSaved = exclusions.save({
  id: 'e',
  parentAnnotationId: null,
  status: { legacy: false },
  extra: 4,
  source: 'new'
});
const exclusionList = exclusions.list({ parentAnnotationId: 0, includeDeleted: [] });
const exclusionDeleted = exclusions.deleteByAnnotationIds('abc');
export type ExclusionAssertions = [
  Assert<Equal<typeof exclusionSaved.source, string>>,
  Assert<Equal<(typeof exclusionList)[number]['extra'], number>>,
  Assert<Equal<(typeof exclusionDeleted)[number], (typeof exclusionList)[number] | null | undefined>>
];
createInMemoryAnnotationExclusionRepository({ records: null }).deleteByAnnotationIds(undefined);
createInMemoryAnnotationRevisionRepository().save({ id: 'r', revision: Symbol(), oldAnchor: {} });
const scopes = createInMemoryAnalysisScopeRepository({
  records: [{ id: 's', spaceId: 7, idempotencyKey: Symbol(), deletedAt: 0, segments: [1] }]
});
const scope = scopes.findByIdempotencyKey(7, Symbol());
const scopeList = scopes.list({ spaceId: 0, includeDeleted: 'false' });
export type ScopeAssertions = [
  Assert<Equal<NonNullable<typeof scope>['segments'], number[]>>,
  Assert<Equal<(typeof scopeList)[number]['deletedAt'], number>>
];
createInMemoryAnalysisScopeRepository({ records: null }).list();
// @ts-expect-error 默认历史读取视图没有把修订值宣称为 number。
const numericRevision: number = createInMemoryAnnotationRevisionRepository().list()[0].revision;
// @ts-expect-error 分析范围没有批量删除标注的方法。
scopes.deleteByAnnotationIds([]);
void [
  active,
  model,
  allDeleted,
  numericRevision,
  changed,
  revisionSaved,
  revisionFound,
  revisionList,
  revisionSingleDeleted,
  exclusionSaved,
  exclusionList,
  exclusionDeleted,
  scope,
  scopeList
];
