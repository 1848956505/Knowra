import { useState, type ReactNode } from 'react';
import type { KnowledgeItem } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogFooter } from '../../components/ui';
import { KnowledgeItemForm, knowledgeFormValue, useKnowledgeFormSafety, type KnowledgeFormValue } from './KnowledgeItemForm';
import { knowledgeError } from './knowledgeViewModel';
import styles from './KnowledgeWorkspaceView.module.css';

export function KnowledgeItemDialog({ title, initialValue, canWrite, readOnlyReason, children, onClose, onSubmit, onSaved }: {
  title: string; initialValue?: Partial<KnowledgeFormValue>; canWrite: boolean; readOnlyReason?: string;
  children?: ReactNode; onClose(): void; onSubmit(value: KnowledgeFormValue): Promise<KnowledgeItem | void>;
  onSaved?(item: KnowledgeItem | void): void;
}) {
  const [initial] = useState(() => knowledgeFormValue(initialValue));
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(initial) !== JSON.stringify(value);
  const releaseSafety = useKnowledgeFormSafety(dirty || pending);
  function requestClose() { if (!pending) { if (dirty) setConfirmDiscard(true); else onClose(); } }
  async function submit() {
    if (!canWrite || pending || !value.title.trim()) return;
    setPending(true); setError('');
    let item: KnowledgeItem | void;
    try { item = await onSubmit({ ...value, title: value.title.trim(), canonicalStatement: value.canonicalStatement.trim(), userExplanation: value.userExplanation.trim() }); }
    catch (cause) { setError(knowledgeError(cause, '保存失败，输入已保留。')); setPending(false); return; }
    releaseSafety();
    onClose();
    onSaved?.(item);
  }
  return <>
    <Dialog title={title} size="md" isOpen isPending={pending} onOpenChange={open => { if (!open) requestClose(); }}>
      <DialogBody>
        {!canWrite ? <p className={styles.notice}>{readOnlyReason ?? '当前为只读模式，暂不能修改知识。'}</p> : null}
        {children}
        <KnowledgeItemForm value={value} disabled={!canWrite || pending} onChange={setValue} />
        <p className={styles.hint}>先保存为候选，核对核心陈述与来源后再确认。修改已确认的正文会转为待修订。</p>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </DialogBody>
      <DialogFooter><Button variant="ghost" isDisabled={pending} onPress={requestClose}>取消</Button><Button variant="primary" isPending={pending} isDisabled={!canWrite || !value.title.trim()} onPress={() => void submit()}>保存</Button></DialogFooter>
    </Dialog>
    {confirmDiscard ? <Dialog title="放弃未保存的知识修改？" description="关闭后，本次输入的修改将丢失。" isOpen onOpenChange={open => { if (!open) setConfirmDiscard(false); }}>
      <DialogFooter><Button variant="primary" onPress={() => setConfirmDiscard(false)}>继续编辑</Button><Button variant="danger" onPress={onClose}>放弃修改</Button></DialogFooter>
    </Dialog> : null}
  </>;
}
