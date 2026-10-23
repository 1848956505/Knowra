import {
  findInsecureImageUrls,
  assertNoInsecureImageUrls
} from '../src/modules/knowledge/application/note-content-policy.js';
import {
  findInsecureImageUrls as findTs,
  assertNoInsecureImageUrls as assertTs
} from '../src/modules/knowledge/application/note-content-policy.ts';

type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
declare const input: unknown;
const _unknown = findInsecureImageUrls(input);
const _undefined = findInsecureImageUrls(undefined);
const _null = findInsecureImageUrls(null);
const _string = findInsecureImageUrls('![x](http://a)');
const _object = findInsecureImageUrls({ rawMarkdown: 'body' });
const _symbol = findInsecureImageUrls(Symbol('body'));
const _assert = assertNoInsecureImageUrls(input);
const _void: void = assertNoInsecureImageUrls('safe');
const _copied = [...findInsecureImageUrls(input)];
// 与 snapshot、sync 和迁移检查相同的实际调用形态，不要求完整领域模型。
const _snapshot = (notes: ReadonlyArray<{ rawMarkdown?: unknown }>) => {
  for (const note of notes) assertNoInsecureImageUrls(note.rawMarkdown);
};
const _migration = (note: { id: string; rawMarkdown: unknown }) => {
  const insecureUrls = findInsecureImageUrls(note.rawMarkdown);
  return { noteId: note.id, count: insecureUrls.length };
};
export type NoteContentPolicyContracts = [
  Assert<Equal<Parameters<typeof findInsecureImageUrls>, [markdown: unknown]>>,
  Assert<Equal<Parameters<typeof assertNoInsecureImageUrls>, [markdown: unknown]>>,
  Assert<Equal<ReturnType<typeof findInsecureImageUrls>, unknown[]>>,
  Assert<Equal<ReturnType<typeof assertNoInsecureImageUrls>, void>>,
  Assert<Equal<typeof findTs, typeof findInsecureImageUrls>>,
  Assert<Equal<typeof assertTs, typeof assertNoInsecureImageUrls>>,
  Assert<Equal<typeof _unknown, unknown[]>>,
  Assert<Equal<typeof _undefined, unknown[]>>,
  Assert<Equal<typeof _null, unknown[]>>,
  Assert<Equal<typeof _string, unknown[]>>,
  Assert<Equal<typeof _object, unknown[]>>,
  Assert<Equal<typeof _symbol, unknown[]>>,
  Assert<Equal<typeof _assert, void>>,
  Assert<Equal<typeof _copied, unknown[]>>,
  Assert<Equal<ReturnType<typeof _snapshot>, void>>,
  Assert<Equal<ReturnType<typeof _migration>, { noteId: string; count: number }>>,
  Assert<Equal<IsAny<ReturnType<typeof findInsecureImageUrls>[number]>, false>>,
  Assert<Equal<IsAny<ReturnType<typeof assertNoInsecureImageUrls>>, false>>
];
// @ts-expect-error 动态捕获和集合写入结果不能伪装成字符串数组。
const _strings: string[] = findInsecureImageUrls(input);
// @ts-expect-error 校验函数没有成功布尔值或类型守卫语义。
const _boolean: boolean = assertNoInsecureImageUrls(input);
// @ts-expect-error 原公开函数仍有一个必需参数，没有虚构无参契约。
findInsecureImageUrls();
