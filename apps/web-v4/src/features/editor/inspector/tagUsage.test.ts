import { describe, expect, it } from 'vitest';
import { countInspectorTagUsage } from './tagUsage';

describe('检查器标签计数', () => {
  it('只统计存活笔记，每篇的重复标签只记一次，未知标签不创建记录', () => {
    expect(countInspectorTagUsage([{ id: 'used' }, { id: 'unused' }], [
      { deleted: false, tagIds: ['used', 'used', 'unknown'] },
      { deleted: true, tagIds: ['used'] },
      { deleted: false, tagIds: ['used'] }
    ])).toEqual({ used: 2, unused: 0 });
  });
  it('对特殊键与空输入保持旧 Object.fromEntries 语义', () => {
    const tags = [{ id: '__proto__' }, { id: 'constructor' }, { id: 'constructor' }];
    const notes = [{ deleted: false, tagIds: ['__proto__', 'constructor', 'constructor'] }];
    const old = Object.fromEntries(tags.map(tag => [tag.id, notes.filter(note => !note.deleted && note.tagIds.includes(tag.id)).length]));
    expect(countInspectorTagUsage(tags, notes)).toEqual(old);
    expect(countInspectorTagUsage([], notes)).toEqual({});
    expect(countInspectorTagUsage(tags, [])).toEqual(Object.fromEntries(tags.map(tag => [tag.id, 0])));
  });
});
