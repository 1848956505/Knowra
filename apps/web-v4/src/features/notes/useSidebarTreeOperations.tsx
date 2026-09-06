import { useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/AppStoreProvider';
import { CreateEntryDialog, type CreateMode } from './CreateEntryDialog';
import type { SidebarTreeAction } from './SidebarFolderTree';
import {
  DeleteTreeEntryDialog,
  RenameTreeEntryDialog,
  type TreeEntryTarget
} from './TreeEntryDialogs';

type ActiveCreateMode = Exclude<CreateMode, null>;

interface CreateRequest {
  mode: ActiveCreateMode;
  parentFolderId: string | null;
}

export function useSidebarTreeOperations(onMutation?: () => void): {
  openCreate(mode: ActiveCreateMode, parentFolderId?: string | null): void;
  handleTreeAction(action: SidebarTreeAction): void;
  dialogs: ReactNode;
} {
  const createNote = useAppStore((state) => state.createNote);
  const createFolder = useAppStore((state) => state.createFolder);
  const renameNote = useAppStore((state) => state.renameNote);
  const deleteNote = useAppStore((state) => state.deleteNote);
  const setNoteFavorite = useAppStore((state) => state.setNoteFavorite);
  const renameFolder = useAppStore((state) => state.renameFolder);
  const deleteFolder = useAppStore((state) => state.deleteFolder);
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null);
  const [renameTarget, setRenameTarget] = useState<TreeEntryTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TreeEntryTarget | null>(null);

  async function runMutation<T>(mutation: Promise<T>): Promise<T> {
    const result = await mutation;
    onMutation?.();
    return result;
  }

  function openCreate(mode: ActiveCreateMode, parentFolderId: string | null = null) {
    setCreateRequest({ mode, parentFolderId });
  }

  function handleTreeAction(action: SidebarTreeAction) {
    switch (action.type) {
      case 'create-folder':
        openCreate('folder', action.folder.id);
        return;
      case 'create-note':
        openCreate('note', action.folder.id);
        return;
      case 'rename-folder':
        setRenameTarget({ kind: 'folder', id: action.folder.id, name: action.folder.name });
        return;
      case 'delete-folder':
        setDeleteTarget({ kind: 'folder', id: action.folder.id, name: action.folder.name });
        return;
      case 'toggle-favorite':
        void runMutation(setNoteFavorite(action.note.id, !action.note.favorite)).catch(() => undefined);
        return;
      case 'rename-note':
        setRenameTarget({ kind: 'note', id: action.note.id, name: action.note.title || '未命名笔记' });
        return;
      case 'delete-note':
        setDeleteTarget({ kind: 'note', id: action.note.id, name: action.note.title || '未命名笔记' });
    }
  }

  const dialogs = (
    <>
      {createRequest ? (
        <CreateEntryDialog
          key={`${createRequest.mode}:${createRequest.parentFolderId ?? 'root'}`}
          mode={createRequest.mode}
          parentFolderId={createRequest.parentFolderId}
          onOpenChange={(open) => { if (!open) setCreateRequest(null); }}
          onCreateNote={(folderId, title) => runMutation(createNote(folderId, title))}
          onCreateFolder={(parentId, name) => runMutation(createFolder(parentId, name))}
        />
      ) : null}
      {renameTarget ? (
        <RenameTreeEntryDialog
          key={`${renameTarget.kind}:${renameTarget.id}`}
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRename={(value) => renameTarget.kind === 'folder'
            ? runMutation(renameFolder(renameTarget.id, value))
            : runMutation(renameNote(renameTarget.id, value))}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteTreeEntryDialog
          key={`${deleteTarget.kind}:${deleteTarget.id}`}
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDelete={() => deleteTarget.kind === 'folder'
            ? runMutation(deleteFolder(deleteTarget.id))
            : runMutation(deleteNote(deleteTarget.id))}
        />
      ) : null}
    </>
  );

  return { openCreate, handleTreeAction, dialogs };
}
