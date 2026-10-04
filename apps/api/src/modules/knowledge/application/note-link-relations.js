import { extractNoteLinks, calculateContentHash } from '@study-accelerator/content-anchor';
import { validationError } from './knowledge-errors.js';

export function addedNoteLinkTargets(markdown, before = '') {
  const old = new Set(extractNoteLinks(before).occurrences.map(item => item.targetNoteId));
  return [...new Set(extractNoteLinks(markdown).occurrences.map(item => item.targetNoteId))].filter(id => !old.has(id));
}

export function assertNoteLinkTarget(target, spaceId) {
  // 历史版本/导入正文可能保留已永久删除的 ID；它只能显示失效，不能变成其他空间目标。
  if (target && target.spaceId !== spaceId) throw validationError('NOTE_LINK_TARGET_INVALID', '链接目标必须是当前空间内的笔记。');
}

function summary(note) { return { id: note.id, title: note.title, folderId: note.folderId ?? null }; }

/** 查询完整空间持久化数据；反链逐处返回，不依赖前端当前已加载列表。 */
export function buildNoteLinkRelations(note, notes) {
  const available = notes.filter(item => item.spaceId === note.spaceId);
  const byId = new Map(available.map(item => [item.id, item]));
  const links = extractNoteLinks(note.rawMarkdown);
  const outgoing = links.targetIds.map(id => {
    const target = byId.get(id);
    return { id, title: target?.title ?? '目标已删除', folderId: target?.folderId ?? null,
      status: !target || target.deleted ? 'deleted' : 'active',
      occurrences: links.occurrences.filter(item => item.targetNoteId === id) };
  });
  const backlinks = available.filter(item => !item.deleted && item.id !== note.id).flatMap(source => {
    const parsed = extractNoteLinks(source.rawMarkdown);
    const occurrences = parsed.occurrences.filter(item => item.targetNoteId === note.id);
    return parsed.targetIds.includes(note.id) ? [{ ...summary(source), occurrences }] : [];
  });
  return { noteId: note.id, spaceId: note.spaceId, contentHash: calculateContentHash(note.rawMarkdown), outgoing, backlinks };
}
