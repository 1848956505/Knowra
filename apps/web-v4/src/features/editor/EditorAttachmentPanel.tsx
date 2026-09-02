import { useEffect, useRef, useState } from 'react';
import type { Attachment } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogClose, DialogFooter, TextField } from '../../components/ui';
import { DeleteIcon, EditIcon, PaperclipIcon, PlusIcon } from '../../shell/icons';
import {
  buildAttachmentContentUrl,
  formatAttachmentSize,
  isAttachmentReferenced
} from './attachmentFiles';
import styles from './EditorInspector.module.css';

export function EditorAttachmentPanel({ attachments, markdown, canWrite, loading, onUpload, onRename, onDelete }: {
  attachments: Attachment[];
  markdown: string;
  canWrite: boolean;
  loading: boolean;
  onUpload(file: File): Promise<Attachment>;
  onRename(attachmentId: string, fileName: string): Promise<Attachment>;
  onDelete(attachmentId: string): Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [renameTarget, setRenameTarget] = useState<Attachment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);

  async function upload(file: File) {
    setPending(true);
    setError('');
    try {
      await onUpload(file);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '附件上传失败，请重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.attachmentPanel}>
      <input
        ref={inputRef}
        className={styles.nativeFileInput}
        type="file"
        aria-label="选择要上传的附件"
        disabled={!canWrite || pending}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void upload(file);
        }}
      />
      <Button
        variant="ghost"
        isDisabled={!canWrite || pending}
        isPending={pending}
        onPress={() => inputRef.current?.click()}
      >
        <PlusIcon size={14} /> 上传附件
      </Button>
      {loading ? <p className={styles.emptyInline} role="status">正在加载附件…</p> : null}
      {!loading && attachments.length === 0 ? <p className={styles.emptyInline}>暂无附件</p> : null}
      {attachments.length > 0 ? (
        <div className={styles.attachmentList}>
          {attachments.map((attachment) => {
            const referenced = isAttachmentReferenced(markdown, attachment.id);
            return (
              <div key={attachment.id} className={styles.attachmentRow}>
                <a href={buildAttachmentContentUrl(attachment.id)} target="_blank" rel="noreferrer">
                  <PaperclipIcon size={15} />
                  <span><strong>{attachment.fileName}</strong><small>{formatAttachmentSize(attachment.size)}</small></span>
                </a>
                {referenced ? <span className={styles.referenceBadge}>正文中</span> : null}
                <button type="button" aria-label={`重命名附件 ${attachment.fileName}`} disabled={!canWrite} onClick={() => setRenameTarget(attachment)}><EditIcon size={14} /></button>
                <button
                  type="button"
                  aria-label={`删除附件 ${attachment.fileName}`}
                  title={referenced ? '请先删除正文中的附件引用' : '删除附件'}
                  disabled={!canWrite || referenced}
                  onClick={() => setDeleteTarget(attachment)}
                ><DeleteIcon size={14} /></button>
              </div>
            );
          })}
        </div>
      ) : null}
      {error ? <p className={styles.versionError} role="alert">{error}</p> : null}
      <RenameAttachmentDialog target={renameTarget} onOpenChange={(open) => { if (!open) setRenameTarget(null); }} onRename={onRename} />
      <DeleteAttachmentDialog target={deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} onDelete={onDelete} />
    </div>
  );
}

function RenameAttachmentDialog({ target, onOpenChange, onRename }: {
  target: Attachment | null;
  onOpenChange(open: boolean): void;
  onRename(attachmentId: string, fileName: string): Promise<Attachment>;
}) {
  const [fileName, setFileName] = useState(target?.fileName ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!target) return;
    setFileName(target.fileName);
    setError('');
  }, [target]);
  if (!target) return null;
  const normalized = fileName.trim();
  return (
    <Dialog title="重命名附件" isOpen onOpenChange={onOpenChange} isPending={pending}>
      <DialogBody>
        <TextField label="文件名" value={fileName} onChange={setFileName} autoComplete="off" />
        {error ? <p className={styles.versionError} role="alert">{error}</p> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose variant="ghost">取消</DialogClose>
        <Button variant="primary" isDisabled={!normalized} isPending={pending} onPress={() => {
          setPending(true);
          setError('');
          void onRename(target.id, normalized)
            .then(() => onOpenChange(false))
            .catch((renameError) => setError(renameError instanceof Error ? renameError.message : '附件重命名失败'))
            .finally(() => setPending(false));
        }}>保存文件名</Button>
      </DialogFooter>
    </Dialog>
  );
}

function DeleteAttachmentDialog({ target, onOpenChange, onDelete }: {
  target: Attachment | null;
  onOpenChange(open: boolean): void;
  onDelete(attachmentId: string): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setError(''), [target]);
  if (!target) return null;
  return (
    <Dialog title="删除附件？" description={`“${target.fileName}”将从本地附件存储中删除。`} isOpen onOpenChange={onOpenChange} isPending={pending}>
      <DialogBody>{error ? <p className={styles.versionError} role="alert">{error}</p> : null}</DialogBody>
      <DialogFooter>
        <DialogClose variant="ghost">取消</DialogClose>
        <Button variant="danger" isPending={pending} onPress={() => {
          setPending(true);
          setError('');
          void onDelete(target.id)
            .then(() => onOpenChange(false))
            .catch((deleteError) => setError(deleteError instanceof Error ? deleteError.message : '附件删除失败'))
            .finally(() => setPending(false));
        }}>删除附件</Button>
      </DialogFooter>
    </Dialog>
  );
}
