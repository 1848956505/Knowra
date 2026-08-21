import { useEffect, useState } from 'react';
import type { Folder } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogClose, DialogFooter, Select, TextField } from '../../components/ui';
import type { LibraryResource } from './libraryTypes';
import styles from './Library.module.css';

export type LibraryConfirmAction =
  | { kind: 'delete-folder'; resource: Extract<LibraryResource, { kind: 'folder' }> }
  | { kind: 'delete-note'; resource: Extract<LibraryResource, { kind: 'note' }>; permanent: boolean };

interface LibraryDialogsProps {
  folderOpen: boolean;
  folderParentId: string | null;
  noteOpen: boolean;
  folders: Folder[];
  confirmAction: LibraryConfirmAction | null;
  pending: boolean;
  onFolderOpenChange(open: boolean): void;
  onNoteOpenChange(open: boolean): void;
  onConfirmOpenChange(open: boolean): void;
  onCreateFolder(name: string, parentId: string | null): Promise<void>;
  onCreateNote(title: string, folderId: string | null): Promise<void>;
  onConfirm(action: LibraryConfirmAction): Promise<void>;
}
export function LibraryDialogs({
  folderOpen,
  folderParentId,
  noteOpen,
  folders,
  confirmAction,
  pending,
  onFolderOpenChange,
  onNoteOpenChange,
  onConfirmOpenChange,
  onCreateFolder,
  onCreateNote,
  onConfirm
}: LibraryDialogsProps) {
  const [folderName, setFolderName] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteFolderId, setNoteFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (folderOpen) setFolderName('');
  }, [folderOpen]);

  useEffect(() => {
    if (noteOpen) {
      setNoteTitle('');
      setNoteFolderId(folderParentId);
    }
  }, [folderParentId, noteOpen]);

  return (
    <>
      <Dialog
        title="新建目录"
        description="目录名称会显示在左侧资料目录中。"
        size="sm"
        isOpen={folderOpen}
        onOpenChange={onFolderOpenChange}
        isPending={pending}
      >
        <DialogBody>
          <TextField
            label="目录名称"
            value={folderName}
            onChange={setFolderName}
            placeholder="例如：产品设计"
            isRequired
            autoFocus
          />
        </DialogBody>
        <DialogFooter>
          <DialogClose>取消</DialogClose>
          <Button variant="accent" onClick={() => void onCreateFolder(folderName.trim(), folderParentId)} isDisabled={!folderName.trim() || pending}>
            创建目录
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        title="新建笔记"
        description="先创建资料条目，正文将在 V4-07 编辑器中继续完成。"
        size="sm"
        isOpen={noteOpen}
        onOpenChange={onNoteOpenChange}
        isPending={pending}
      >
        <DialogBody>
          <TextField
            label="笔记标题"
            value={noteTitle}
            onChange={setNoteTitle}
            placeholder="例如：一次产品复盘"
            isRequired
            autoFocus
          />
          <Select
            label="所属目录"
            selectedKey={noteFolderId ?? 'root'}
            onSelectionChange={(key) => setNoteFolderId(key === 'root' ? null : String(key))}
            options={[{ id: 'root', label: '未整理' }, ...folders.map((folder) => ({ id: folder.id, label: folder.name }))]}
          />
        </DialogBody>
        <DialogFooter>
          <DialogClose>取消</DialogClose>
          <Button variant="accent" onClick={() => void onCreateNote(noteTitle.trim(), noteFolderId)} isDisabled={!noteTitle.trim() || pending}>
            创建笔记
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        title={getConfirmTitle(confirmAction)}
        description={getConfirmDescription(confirmAction)}
        size="sm"
        isOpen={Boolean(confirmAction)}
        onOpenChange={onConfirmOpenChange}
        isPending={pending}
      >
        <DialogBody>
          <p className={styles.confirmText}>这项操作会立即写入资料服务，请确认后继续。</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose>取消</DialogClose>
          <Button
            variant="danger"
            onClick={() => {
              if (confirmAction) void onConfirm(confirmAction);
            }}
            isDisabled={pending || !confirmAction}
          >
            {confirmAction?.kind === 'delete-note' && confirmAction.permanent ? '永久删除' : '确认操作'}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function getConfirmTitle(action: LibraryConfirmAction | null): string {
  if (!action) return '确认操作';
  if (action.kind === 'delete-folder') return `删除目录「${action.resource.folder.name}」`;
  return action.permanent ? `永久删除「${action.resource.note.title}」` : `移入回收站「${action.resource.note.title}」`;
}

function getConfirmDescription(action: LibraryConfirmAction | null): string {
  if (!action) return '';
  if (action.kind === 'delete-folder') return '目录下的子目录也会被删除，笔记将失去当前目录归属。';
  return action.permanent ? '永久删除后无法恢复正文与资料关系。' : '笔记会进入回收站，可在回收站中恢复。';
}
