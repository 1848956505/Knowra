import { useState } from 'react';
import type { Note } from '@study-accelerator/web-core';
import { useAppStore } from '../../store/AppStoreProvider';
import type { LibraryResource } from './libraryTypes';
import type { LibraryConfirmAction } from './LibraryDialogs';
import type { useLibraryIndex } from './useLibraryIndex';

type LibraryIndex = ReturnType<typeof useLibraryIndex>;

export interface UseLibraryActionsOptions {
  index: LibraryIndex;
  onOpenNote?(note: Note): void;
}

export function useLibraryActions({ index, onOpenNote }: UseLibraryActionsOptions) {
  const canWrite = useAppStore((state) => state.canWriteWorkspace());
  const createFolder = useAppStore((state) => state.createFolder);
  const updateFolder = useAppStore((state) => state.updateFolder);
  const deleteFolder = useAppStore((state) => state.deleteFolder);
  const createNote = useAppStore((state) => state.createNote);
  const deleteNote = useAppStore((state) => state.deleteNote);
  const restoreNote = useAppStore((state) => state.restoreNote);
  const permanentlyDeleteNote = useAppStore((state) => state.permanentlyDeleteNote);
  const setNoteFavorite = useAppStore((state) => state.setNoteFavorite);
  const setNoteTags = useAppStore((state) => state.setNoteTags);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<LibraryConfirmAction | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function reportError(error: unknown, fallback: string) {
    setActionError(error instanceof Error ? error.message : fallback);
  }

  function openFolderDialog(parentId: string | null) {
    setActionError(null);
    setFolderParentId(parentId);
    setFolderDialogOpen(true);
  }

  function openNoteDialog() {
    setActionError(null);
    setNoteDialogOpen(true);
  }

  async function handleCreateFolder(name: string, parentId: string | null) {
    if (!name) return;
    setPending(true);
    try {
      await createFolder({ name, parentId, spaceId: index.serverData.currentSpaceId ?? '' });
      setFolderDialogOpen(false);
    } catch (error) {
      reportError(error, '目录创建失败。');
      throw error;
    } finally {
      setPending(false);
    }
  }

  async function handleCreateNote(title: string, folderId: string | null) {
    if (!title) return;
    setPending(true);
    try {
      await createNote({
        title,
        rawMarkdown: `# ${title}\n\n`,
        folderId,
        spaceId: index.serverData.currentSpaceId ?? ''
      });
      setNoteDialogOpen(false);
    } catch (error) {
      reportError(error, '笔记创建失败。');
      throw error;
    } finally {
      setPending(false);
    }
  }

  async function handleRenameFolder(folderId: string, name: string) {
    await updateFolder(folderId, { name });
  }

  async function handleMoveFolder(folderId: string, parentId: string) {
    await updateFolder(folderId, { parentId });
  }

  async function handleConfirm(action: LibraryConfirmAction) {
    setPending(true);
    try {
      if (action.kind === 'delete-folder') await deleteFolder(action.resource.folder.id);
      else if (action.permanent) await permanentlyDeleteNote(action.resource.note.id);
      else await deleteNote(action.resource.note.id);
      setConfirmAction(null);
    } catch (error) {
      reportError(error, '资料操作失败。');
      throw error;
    } finally {
      setPending(false);
    }
  }

  async function handleSetTags(noteId: string, tagIds: string[]) {
    try {
      await setNoteTags(noteId, tagIds);
    } catch (error) {
      reportError(error, '标签更新失败。');
      throw error;
    }
  }

  function handleOpen(resource: LibraryResource) {
    if (resource.kind === 'folder') {
      index.selectTreeItem(`folder:${resource.folder.id}`);
      return;
    }
    index.selectResource(resource);
    onOpenNote?.(resource.note);
  }

  function handleDelete(resource: LibraryResource) {
    if (resource.kind === 'folder') setConfirmAction({ kind: 'delete-folder', resource });
    else setConfirmAction({ kind: 'delete-note', resource, permanent: false });
  }

  function handleRestore(note: Note) {
    void restoreNote(note.id).catch((error) => reportError(error, '资料恢复失败。'));
  }

  function handlePermanentDelete(note: Note) {
    setConfirmAction({
      kind: 'delete-note',
      resource: { kind: 'note', id: `note:${note.id}`, note },
      permanent: true
    });
  }

  function handleToggleFavorite(note: Note) {
    void setNoteFavorite(note.id, !note.favorite).catch((error) => reportError(error, '收藏状态更新失败。'));
  }

  return {
    actionError,
    canWrite,
    confirmAction,
    folderDialogOpen,
    folderParentId,
    handleConfirm,
    handleCreateFolder,
    handleCreateNote,
    handleDelete,
    handleMoveFolder,
    handleOpen,
    handlePermanentDelete,
    handleRestore,
    handleRenameFolder,
    handleSetTags,
    handleToggleFavorite,
    inspectorCollapsed,
    noteDialogOpen,
    onActionError: setActionError,
    onConfirmActionChange: setConfirmAction,
    onFolderDialogChange: setFolderDialogOpen,
    onInspectorCollapsedChange: setInspectorCollapsed,
    onNoteDialogChange: setNoteDialogOpen,
    openFolderDialog,
    openNoteDialog,
    pending
  };
}
