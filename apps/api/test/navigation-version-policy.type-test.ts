import { createNavigationReferencePolicy } from '../src/modules/knowledge/application/navigation-reference-policy.js';
import { createNavigationReferencePolicy as createTs } from '../src/modules/knowledge/application/navigation-reference-policy.ts';
import type {
  NavigationReferencePolicy,
  NoteReferenceInput,
  NavigationReferencePolicyOptions
} from '../src/modules/knowledge/application/navigation-reference-policy.ts';
import {
  selectCoalescibleVersion,
  NOTE_VERSION_COALESCE_WINDOW_MS
} from '../src/modules/knowledge/application/note-version-coalescing.js';
import { selectCoalescibleVersion as selectTs } from '../src/modules/knowledge/application/note-version-coalescing.ts';
import type { CoalescingVersionInput } from '../src/modules/knowledge/application/note-version-coalescing.ts';
import { createInMemoryKnowledgeSpaceRepository } from '../src/modules/knowledge/infrastructure/knowledge-space-repository.ts';
import { createInMemoryFolderRepository } from '../src/modules/knowledge/infrastructure/folder-repository.ts';
import { createInMemoryTagRepository } from '../src/modules/knowledge/infrastructure/tag-repository.ts';
import { createInMemoryTagGroupRepository } from '../src/modules/knowledge/infrastructure/tag-group-repository.ts';
import type { NoteVersion } from '../src/modules/knowledge/domain/note-version.ts';

type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
declare const unknownValue: unknown;
declare const history: readonly CoalescingVersionInput[];
declare const current: CoalescingVersionInput;
declare const versions: readonly NoteVersion[];
declare const noteVersion: NoteVersion;
const _ports: NavigationReferencePolicyOptions = {
  knowledgeSpaceRepository: createInMemoryKnowledgeSpaceRepository(),
  folderRepository: createInMemoryFolderRepository(),
  tagRepository: createInMemoryTagRepository(),
  tagGroupRepository: createInMemoryTagGroupRepository(),
  enforceReferences: unknownValue
};
const policy = createNavigationReferencePolicy(_ports);
const _normalized = policy.normalizeTagIds(['a', 'b']);
const _noArg = policy.normalizeTagIds();
const _null = policy.normalizeTagIds(null);
const _iterable = policy.normalizeTagIds(new Set([unknownValue]));
const _stringIterable = policy.normalizeTagIds('abc');
const _space = policy.assertSpaceReference(unknownValue, unknownValue);
const _group = policy.assertTagGroupReference(unknownValue, unknownValue);
const _note = policy.assertNoteReferences({ tagIds: Object.freeze([unknownValue]) });
const _custom = policy.assertNoteReferences({
  tagIds: {
    forEach(callback) {
      callback(unknownValue, 0, []);
    }
  }
});
const _historical = selectCoalescibleVersion({ versions: history, current, windowMs: unknownValue });
const _domain = selectCoalescibleVersion({ versions, current: noteVersion });
const _extra = selectCoalescibleVersion({
  versions: [{ id: 'x', marker: 123 }],
  current: { id: 42, content: unknownValue }
});
const _empty = {};
const _minimal = selectCoalescibleVersion({ versions: [_empty], current: {} });
const _date = selectCoalescibleVersion({ versions: [{ createdAt: new Date(), noteId: null }], current: {} });
const _never = selectCoalescibleVersion<never>({ versions: [], current });
const _union = selectCoalescibleVersion<{ id: 'a'; a: true } | { id: 'b'; b: false }>({ versions: [], current });
// 与真实 index.js 的前像比较接线一致，不要求内容被验证成字符串。
const _before = (rows: readonly CoalescingVersionInput[], now: CoalescingVersionInput, before: unknown) => {
  const previous = selectCoalescibleVersion({ versions: rows, current: now });
  return !!previous && previous.content === before;
};
export type NavigationVersionPolicyContracts = [
  Assert<Equal<typeof createTs, typeof createNavigationReferencePolicy>>,
  Assert<Equal<typeof selectTs, typeof selectCoalescibleVersion>>,
  Assert<Equal<typeof policy, NavigationReferencePolicy>>,
  Assert<Equal<typeof _normalized, unknown[]>>,
  Assert<Equal<typeof _noArg, unknown[]>>,
  Assert<Equal<typeof _null, unknown[]>>,
  Assert<Equal<typeof _iterable, unknown[]>>,
  Assert<Equal<typeof _stringIterable, unknown[]>>,
  Assert<Equal<typeof _space, void>>,
  Assert<Equal<typeof _group, void>>,
  Assert<Equal<typeof _note, void>>,
  Assert<Equal<typeof _custom, void>>,
  Assert<Equal<typeof _historical, CoalescingVersionInput | null>>,
  Assert<Equal<typeof _domain, NoteVersion | null>>,
  Assert<Equal<typeof _extra, { id: string; marker: number } | null>>,
  Assert<Equal<typeof _minimal, typeof _empty | null>>,
  Assert<Equal<typeof _date, { createdAt: Date; noteId: null } | null>>,
  Assert<Equal<typeof _never, null>>,
  Assert<Equal<typeof _union, { id: 'a'; a: true } | { id: 'b'; b: false } | null>>,
  Assert<Equal<ReturnType<typeof _before>, boolean>>,
  Assert<Equal<typeof NOTE_VERSION_COALESCE_WINDOW_MS, number>>,
  Assert<Equal<CoalescingVersionInput['id'], unknown>>,
  Assert<Equal<CoalescingVersionInput['noteId'], unknown>>,
  Assert<Equal<CoalescingVersionInput['content'], unknown>>,
  Assert<Equal<CoalescingVersionInput['contentHash'], unknown>>,
  Assert<Equal<CoalescingVersionInput['createdAt'], unknown>>,
  Assert<Equal<CoalescingVersionInput['createdBy'], unknown>>,
  Assert<Equal<IsAny<typeof _historical>, false>>,
  Assert<Equal<IsAny<(typeof _normalized)[number]>, false>>,
  Assert<Equal<Parameters<NavigationReferencePolicy['assertNoteReferences']>, [input: NoteReferenceInput]>>
];
// @ts-expect-error Boolean 过滤没有验证元素是字符串。
const _strings: string[] = _normalized;
// @ts-expect-error 历史时间戳未验证，不能伪装字符串。
const _time: string = _historical!.createdAt;
// @ts-expect-error 历史标识未验证，不能伪装字符串。
const _id: string = _historical!.id;
// @ts-expect-error 返回值不凭空获得 current 的字段。
const _content = _extra!.content;
// @ts-expect-error 选择可能为空，不能丢弃 null。
const _nonNull: NoteVersion = _domain;
// @ts-expect-error 不将未知内容宣称为字符串。
const _body: string = _historical!.content;
// @ts-expect-error 引用校验不是类型守卫或成功布尔值。
const _success: boolean = _note;
// @ts-expect-error 正常调用需要可遍历输入，不接受任意对象。
policy.normalizeTagIds({ tagIds: [] });
// @ts-expect-error 正常引用输入仍需 forEach 端口。
policy.assertNoteReferences({ tagIds: 42 });
