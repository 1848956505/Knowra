import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anchorForSection, anchorFromProjectedRange, projectMarkdown, type ContentAnchor } from '@study-accelerator/content-anchor';
import { parseKnowraMarks } from '@study-accelerator/shared/knowra-marks';
import type { Annotation, Note } from '@study-accelerator/web-core';
import { checkInlineMigration, executeInlineMigration, summarizeChecks, type MigrationApi } from './annotationInlineMigrationRunner';
import type { MigrationCodec } from './annotationInlineMigration';
import { createMigrationCodec } from './annotationInlineMigration.testing';

let codec: MigrationCodec & { destroy(): Promise<void> };
beforeAll(async () => { codec = await createMigrationCodec(); });
afterAll(async () => { await codec.destroy(); });

/** 模拟服务端：保存正文时按标记派生 v3 行；旧行可取消、可改备注。 */
function fakeServer(notes: Note[], annotations: Annotation[], options: { derive?: boolean; conflictOn?: string } = {}) {
  const calls: string[] = [];
  let version = 0;
  const api: MigrationApi & { calls: string[] } = {
    calls,
    async getNote(id) { return { ...notes.find(note => note.id === id)! }; },
    async updateNote(id, input) {
      calls.push(`save:${id}`);
      const note = notes.find(item => item.id === id)!;
      if (options.conflictOn === id || input.expectedUpdatedAt !== note.updatedAt) throw new Error('笔记已在其他地方修改');
      Object.assign(note, { rawMarkdown: input.rawMarkdown, updatedAt: `v${version += 1}` });
      if (options.derive !== false) {
        const parsed = parseKnowraMarks(note.rawMarkdown!);
        for (const markId of new Set([...parsed.inline.map(item => item.id), ...parsed.blocks.filter(item => !item.exclude).map(item => item.id)])) {
          if (annotations.some(item => item.noteId === id && (item.anchor as unknown as { markId?: string })?.markId === markId)) continue;
          annotations.push({ id: `annotation-k-${markId}`, noteId: id, schemaVersion: 3, lifecycleStatus: 'active', revision: 1, comment: '', anchor: { format: 'knowra-inline', markId } } as unknown as Annotation);
        }
      }
      return { ...note };
    },
    async listAnnotations(noteId) { return annotations.filter(item => item.noteId === noteId && item.lifecycleStatus !== 'deleted').map(item => ({ ...item })); },
    async deleteAnnotation(id) { calls.push(`delete:${id}`); const row = annotations.find(item => item.id === id)!; row.lifecycleStatus = 'deleted'; return { ...row }; },
    async updateAnnotation(id, input) { calls.push(`comment:${id}`); const row = annotations.find(item => item.id === id)!; row.comment = input.comment; return { ...row }; },
    async previewAnnotation(id) { return { annotation: annotations.find(item => item.id === id)!, exclusions: [] } as never; }
  };
  return api;
}

const legacy = (id: string, noteId: string, anchor: ContentAnchor, extra: Partial<Annotation> = {}) => ({
  id, noteId, schemaVersion: 2, scopeType: anchor.scopeType, anchor, quoteText: anchor.quoteText, kind: 'important', importance: 'normal',
  lifecycleStatus: 'active', anchorStatus: 'resolved', status: 'active', revision: 1, comment: '', ...extra
}) as unknown as Annotation;

async function fixture(markdownA = '## 第一章\n\n勾股定理指出两边平方和等于斜边平方。\n') {
  const markdown = codec.serialize(codec.parse(markdownA));
  const projection = projectMarkdown(markdown);
  const start = projection.text.indexOf('两边平方和');
  const notes = [
    { id: 'a', title: '甲', spaceId: 's', rawMarkdown: markdown, updatedAt: 'v0' },
    { id: 'b', title: '乙', spaceId: 's', rawMarkdown: '没有重点\n', updatedAt: 'v0' },
    { id: 'c', title: '回收站', spaceId: 's', rawMarkdown: markdown, updatedAt: 'v0', deleted: true }
  ] as unknown as Note[];
  const annotations = [
    legacy('old-sel', 'a', anchorFromProjectedRange(projection, start, start + 5), { comment: '考试必考', importance: 'core' }),
    legacy('old-sec', 'a', anchorForSection(projection, 0)),
    legacy('old-lost', 'a', anchorForSection(projection, 0), { anchorStatus: 'missing' }),
    legacy('old-trash', 'c', anchorForSection(projection, 0))
  ];
  return { notes, annotations };
}
const refs = (notes: Note[]) => notes.map(note => ({ id: note.id, title: note.title, spaceId: note.spaceId!, deleted: note.deleted }));

describe('迁移重点到正文：执行器', () => {
  it('检查只读；执行后正文写入标记、备注转到新重点、旧重点全部取消（含放弃的）', async () => {
    const { notes, annotations } = await fixture();
    const api = fakeServer(notes, annotations);
    const checks = await checkInlineMigration(refs(notes), api, codec);
    expect(api.calls).toEqual([]);
    expect(checks.map(check => check.note.id)).toEqual(['a']);
    expect(summarizeChecks(checks)).toMatchObject({ notes: 1, migratable: 2, abandoned: 1, blockedNotes: 0 });

    const [result] = await executeInlineMigration(checks, api, codec);
    expect(result).toMatchObject({ status: 'migrated', migrated: 2, abandoned: 1, commentsCarried: 1 });
    const saved = notes.find(note => note.id === 'a')!.rawMarkdown!;
    expect(parseKnowraMarks(saved).inline[0].attrs).toMatchObject({ l: 'core' });
    expect(annotations.filter(item => item.schemaVersion === 2 && item.noteId === 'a').every(item => item.lifecycleStatus === 'deleted')).toBe(true);
    expect(annotations.find(item => item.schemaVersion === 3 && item.comment === '考试必考')).toBeTruthy();
    expect(annotations.find(item => item.id === 'old-trash')!.lifecycleStatus).toBe('active');
  });

  it('保存冲突或没有派生出重点时，这篇失败且旧重点保留；再次执行可以续跑', async () => {
    const conflict = await fixture();
    const conflictApi = fakeServer(conflict.notes, conflict.annotations, { conflictOn: 'a' });
    const [conflicted] = await executeInlineMigration(await checkInlineMigration(refs(conflict.notes), conflictApi, codec), conflictApi, codec);
    expect(conflicted.status).toBe('failed');
    expect(conflictApi.calls.some(call => call.startsWith('delete:'))).toBe(false);

    const lost = await fixture();
    const lostApi = fakeServer(lost.notes, lost.annotations, { derive: false });
    const [missing] = await executeInlineMigration(await checkInlineMigration(refs(lost.notes), lostApi, codec), lostApi, codec);
    expect(missing).toMatchObject({ status: 'failed' });
    expect(missing.message).toContain('旧重点保留');
    expect(lost.annotations.filter(item => item.schemaVersion === 2 && item.noteId === 'a').every(item => item.lifecycleStatus === 'active')).toBe(true);

    // 再跑一次：正文已有标记，不重复写入；服务端只在正文变化时派生，所以缺失的重点如实报告失败、旧重点继续保留。
    // （真实服务端里保存与派生同在一个事务，不会出现"有标记、无重点行"；这里只验证不会重复写入或误删。）
    const resumedApi = fakeServer(lost.notes, lost.annotations);
    const before = lost.notes[0].rawMarkdown;
    const [resumed] = await executeInlineMigration(await checkInlineMigration(refs(lost.notes), resumedApi, codec), resumedApi, codec);
    expect(resumed.status).toBe('failed');
    expect(lost.notes[0].rawMarkdown).toBe(before);
    expect(resumedApi.calls.some(call => call.startsWith('delete:') || call.startsWith('save:'))).toBe(false);
  });

  it('检查之后正文又被改过：按最新正文重新计算再保存', async () => {
    const { notes, annotations } = await fixture();
    const api = fakeServer(notes, annotations);
    const checks = await checkInlineMigration(refs(notes), api, codec);
    const note = notes.find(item => item.id === 'a')!;
    note.rawMarkdown = `${note.rawMarkdown}\n补充一段。\n`;
    note.updatedAt = 'v-edited';
    const [result] = await executeInlineMigration(checks, api, codec);
    expect(result.status).toBe('migrated');
    expect(note.rawMarkdown).toContain('补充一段。');
    expect(parseKnowraMarks(note.rawMarkdown!).inline).toHaveLength(1);
  });
});
