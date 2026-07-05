import { closestFromEventTarget } from '../dom/event-target.js';

export function resolveContextMenuTarget(target) {
  const noteButton = closestFromEventTarget(target, '[data-note-id]');
  if (noteButton?.dataset.noteId) {
    return { kind: 'note', id: noteButton.dataset.noteId, selectFolderId: null };
  }

  const recycleNoteButton = closestFromEventTarget(target, '[data-recycle-note-id]');
  if (recycleNoteButton?.dataset.recycleNoteId) {
    return { kind: 'note', id: recycleNoteButton.dataset.recycleNoteId, selectFolderId: null };
  }

  const recycleSection = closestFromEventTarget(target, '[data-recycle-section]');
  if (recycleSection) {
    return { kind: 'recycle-section', id: 'recycle', selectFolderId: null };
  }

  const folderButton = closestFromEventTarget(target, '[data-folder-id]');
  if (folderButton?.dataset.folderId) {
    return {
      kind: 'folder',
      id: folderButton.dataset.folderId,
      selectFolderId: folderButton.dataset.folderId
    };
  }

  const materialsSection = closestFromEventTarget(target, '[data-materials-section]');
  if (materialsSection) {
    return { kind: 'materials', id: null, selectFolderId: null };
  }

  return null;
}

export function getContextMenuItems({
  targetKind = null,
  targetId = null,
  notes = [],
  recycleNotes = []
} = {}) {
  switch (targetKind) {
    case 'materials':
      return [
        { action: 'create-folder-root', label: '新建目录' },
        { action: 'create-note-root', label: '新建文件' }
      ];
    case 'folder':
      return [
        { action: 'create-folder-child', label: '新建子目录' },
        { action: 'create-note-child', label: '新建文件' },
        { type: 'divider' },
        { action: 'rename-folder', label: '重命名' },
        { action: 'delete-folder', label: '删除' }
      ];
    case 'note':
      return getNoteMenuItems(notes.find((note) => note.id === targetId));
    case 'recycle-section':
      return recycleNotes.length > 0
        ? [{ action: 'empty-recycle-bin', label: '清空回收站' }]
        : [];
    default:
      return [];
  }
}

function getNoteMenuItems(note) {
  if (!note) {
    return [];
  }

  if (note.deleted) {
    return [
      { action: 'restore-note', label: '恢复笔记' },
      { type: 'divider' },
      { action: 'permanently-delete-note', label: '彻底删除' }
    ];
  }

  return [
    {
      action: 'favorite-note',
      label: note.favorite ? '取消收藏' : '收藏笔记'
    },
    { type: 'divider' },
    { action: 'rename-note', label: '重命名' },
    { action: 'delete-note', label: '删除' }
  ];
}
