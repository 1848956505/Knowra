import {
  createInMemoryLearningObjectiveRepository,
  createInMemoryExamProfileRepository,
  createInMemoryExamFocusRepository,
  createInMemoryQuestionRepository,
  createInMemoryQuestionObjectiveRepository,
  createInMemoryQuestionSourceRepository,
  type LearningObjectiveRecord,
  type QuestionObjectiveRecord,
  type QuestionSourceRecord
} from '../src/modules/knowledge/infrastructure/assessment-repository.ts';
import {
  questionObjectiveRecords,
  type QuestionObjectiveIdentityRecord
} from '../src/modules/knowledge/infrastructure/question-objective-identity.ts';
import { LearningObjective } from '../src/modules/knowledge/domain/learning-objective.ts';
import { ExamFocus } from '../src/modules/knowledge/domain/exam-focus.ts';
import { QuestionSource } from '../src/modules/knowledge/domain/question-source.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type IdentityFields = [
  Assert<Equal<QuestionObjectiveIdentityRecord['id'], unknown>>,
  Assert<Equal<QuestionObjectiveIdentityRecord['createdAt'], unknown>>,
  Assert<Equal<QuestionObjectiveIdentityRecord['questionId'], unknown>>,
  Assert<Equal<QuestionObjectiveIdentityRecord['learningObjectiveId'], unknown>>,
  Assert<Equal<QuestionObjectiveIdentityRecord['isPrimary'], boolean>>,
  Assert<Equal<QuestionObjectiveIdentityRecord['order'], number>>,
  Assert<Equal<LearningObjectiveRecord['order'], unknown>>,
  Assert<Equal<QuestionSourceRecord['status'], unknown>>,
  Assert<Equal<QuestionSourceRecord['updatedAt'], unknown>>,
  Assert<Equal<QuestionObjectiveRecord['isPrimary'], unknown>>
];
const raw = { id: Symbol('legacy'), order: { valueOf: () => 3 }, extra: 42, updatedAt: new Date() };
const objectives = createInMemoryLearningObjectiveRepository({ records: [raw] });
const found = objectives.findById(raw.id);
if (found) {
  const extra: number = found.extra;
  const order: { valueOf(): number } = found.order;
  void [extra, order];
}
const same = objectives.save(raw, { expectedUpdatedAt: {} });
export type ExactSave = Assert<Equal<typeof same, typeof raw>>;
const lists = objectives.list({ includeDeleted: 'false', includeArchived: {}, limit: 1n, reviewStatus: Symbol() });
export type SyncList = Assert<Equal<typeof lists, (typeof raw)[]>>;
// @ts-expect-error 本地仓库同步返回，不提供 Promise.then。
objectives.list().then(() => {});
// @ts-expect-error 有记录推断的普通仓库不接收缺少 extra 的其它形状。
objectives.save({ id: 'bad' });
createInMemoryLearningObjectiveRepository().save(new LearningObjective({ id: 'a', knowledgeItemId: 'b' }));
createInMemoryExamFocusRepository().save(new ExamFocus({ id: 'f', examProfileId: 'p', learningObjectiveId: 'o' }));
createInMemoryExamFocusRepository({ records: null }).findByProfileAndObjective({}, {});
createInMemoryExamProfileRepository().list({ includeArchived: [] });
createInMemoryQuestionRepository().save({ id: 'q', answer: { text: 'answer' } });
const relations = createInMemoryQuestionObjectiveRepository({ records: null });
const replacements = relations.replaceForQuestion({}, new Set([Symbol(), NaN]));
export type Generated = Assert<Equal<typeof replacements, QuestionObjectiveIdentityRecord[]>>;
relations.listByQuestionIds('abc');
relations.listByQuestionIds(null);
relations.listByQuestionIds(new Set([{}, 1n]));
const historical = relations.findById('r');
if (historical) {
  // @ts-expect-error 历史字段不可冒充已验证的布尔值。
  const primary: boolean = historical.isPrimary;
  void primary;
}
const sources = createInMemoryQuestionSourceRepository({ records: null });
sources.create(new QuestionSource({ id: 's', questionId: 'q' }));
sources.markBySourceId('manual', {}, { legacy: true });
sources.markBySourceIds('manual', [null, '', {}, 1n], null);
sources.list({ questionId: {} });
// @ts-expect-error 来源 list 不接受通用仓库 limit。
sources.list({ limit: 1 });
// @ts-expect-error 来源批量标记依赖数组.filter，不接收 Set。
sources.markBySourceIds('manual', new Set(['x']));
const changed = sources.markBySourceId('manual', 'x');
// @ts-expect-error 来源标记不保证领域状态枚举。
const state: 'active' | 'stale' | 'reanchored' = changed[0].status;
// @ts-expect-error 替换关系不会保留历史记录任意附加字段。
const extra: number = replacements[0].extra;
const generated = questionObjectiveRecords({}, 'ab', [{ learningObjectiveId: 'a', id: {}, createdAt: {} }], new Date());
questionObjectiveRecords(undefined, null);
questionObjectiveRecords(undefined, undefined);
questionObjectiveRecords(
  'q',
  (function* () {
    yield {};
    yield Symbol();
  })()
);
// @ts-expect-error 即便传 Date/旧 id 字段，输出不伪装 string。
const id: string = generated[0].id;
// @ts-expect-error order 的历史值未归一化为 number。
const order: number = createInMemoryLearningObjectiveRepository().list()[0].order;
void [state, extra, id, order];

const sourceCreated = sources.create({ id: 's', status: 'active' as const, updatedAt: 'old' as const, quote: 'text' });
const sourceSaved = sources.save({ id: 's', status: 'active' as const, updatedAt: 'old' as const, quote: 'text' });
export type MutableSourceResults = [
  Assert<Equal<typeof sourceCreated.status, unknown>>,
  Assert<Equal<typeof sourceCreated.updatedAt, unknown>>,
  Assert<Equal<typeof sourceSaved.status, unknown>>,
  Assert<Equal<typeof sourceSaved.updatedAt, unknown>>
];
questionObjectiveRecords('q', ['o'], [{ learningObjectiveId: 'o', id: 'x' }] as const);
sources.markBySourceIds('manual', ['x'] as const);

void [same, lists, sourceCreated, sourceSaved];
