import { useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  TextField
} from '../../components/ui';

export interface TreeEntryTarget {
  kind: 'folder' | 'note';
  id: string;
  name: string;
}

export function RenameTreeEntryDialog({ target, onClose, onRename }: {
  target: TreeEntryTarget;
  onClose(): void;
  onRename(value: string): Promise<void>;
}) {
  const [value, setValue] = useState(target.name);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const entryLabel = target.kind === 'folder' ? '文件夹' : '笔记';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      setError(`请输入${entryLabel}名称`);
      return;
    }
    setPending(true);
    setError('');
    try {
      await onRename(normalizedValue);
      onClose();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : '重命名失败，请重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog title={`重命名${entryLabel}`} isOpen onOpenChange={(open) => { if (!open) onClose(); }} isPending={pending}>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <DialogBody>
          <TextField
            autoFocus
            label={`${entryLabel}名称`}
            value={value}
            onChange={setValue}
            isRequired
            isInvalid={Boolean(error)}
            errorMessage={error}
          />
        </DialogBody>
        <DialogFooter>
          <DialogClose variant="ghost">取消</DialogClose>
          <Button type="submit" variant="accent" isPending={pending}>保存</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function DeleteTreeEntryDialog({ target, onClose, onDelete }: {
  target: TreeEntryTarget;
  onClose(): void;
  onDelete(): Promise<void>;
}) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const isFolder = target.kind === 'folder';

  async function handleDelete() {
    setPending(true);
    setError('');
    try {
      await onDelete();
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败，请重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      title={isFolder ? '删除文件夹？' : '删除笔记？'}
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      isPending={pending}
    >
      <DialogBody>
        <p>
          {isFolder
            ? `“${target.name}”及其子文件夹将被删除，其中的笔记会移至未整理。`
            : `“${target.name}”将移入回收站。`}
        </p>
        {error ? <p role="alert">{error}</p> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose variant="ghost">取消</DialogClose>
        <Button variant="danger" isPending={pending} onPress={() => void handleDelete()}>删除</Button>
      </DialogFooter>
    </Dialog>
  );
}
