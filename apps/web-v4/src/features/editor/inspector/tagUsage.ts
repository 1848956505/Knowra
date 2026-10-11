import type { Note, Tag } from '@study-accelerator/web-core';

/** 每条存活笔记对同一标签只计一次，与旧 includes 查询保持一致。 */
export function countInspectorTagUsage(tags: Pick<Tag, 'id'>[], notes: Pick<Note, 'tagIds' | 'deleted'>[]): Record<string, number> {
  const counts = new Map(tags.map(tag => [tag.id, 0]));
  for (const note of notes) {
    if (note.deleted) continue;
    for (const id of new Set(note.tagIds)) {
      if (counts.has(id)) counts.set(id, counts.get(id)! + 1);
    }
  }
  return Object.fromEntries(counts);
}
