import { ExtractionDemoNotice } from '../editor/ExtractionEnvironment';
import { useEffect, useState } from 'react';
import type { KnowledgeEvidence, KnowledgeItem, NoteVersion } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogClose, DialogFooter } from '../../components/ui';
import { useAppStore } from '../../store/AppStoreProvider';
import { knowledgeStatusLabel } from './knowledgeViewModel';
import { evidenceApplicabilityLabel, evidenceHealthLabel, sourceVersionError } from './knowledgeSourceViewModel';
import styles from './KnowledgeSourceComparisonDialog.module.css';

interface ComparisonProps {
  item: KnowledgeItem;
  evidence: KnowledgeEvidence;
  onClose(): void;
  onOpenNote(noteId: string): void;
}

/** 只连接已有的历史版本读取能力；不改变来源、知识或笔记。 */
export function KnowledgeSourceComparison(props: ComparisonProps) {
  const getNoteVersion = useAppStore(state => state.getNoteVersion);
  return <KnowledgeSourceComparisonDialog {...props} onGetVersion={getNoteVersion} />;
}

interface DialogProps extends ComparisonProps {
  onGetVersion(noteId: string, versionId: string): Promise<NoteVersion>;
}

type Snapshot = { key: string; version?: NoteVersion; error?: string };

export function KnowledgeSourceComparisonDialog({ item, evidence, onGetVersion, onClose, onOpenNote }: DialogProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [retry, setRetry] = useState(0);
  const { noteId, noteVersionId } = evidence;
  const requestKey = JSON.stringify([noteId, noteVersionId, retry]);
  const current = snapshot?.key === requestKey ? snapshot : null;
  const canLoadVersion = Boolean(noteId && noteVersionId);

  useEffect(() => {
    if (!noteId || !noteVersionId) return;
    let active = true;
    void Promise.resolve().then(() => active ? onGetVersion(noteId, noteVersionId) : undefined)
      .then(version => {
        if (!active) return;
        if (!version || version.id !== noteVersionId || version.noteId !== noteId || typeof version.content !== 'string') {
          setSnapshot({ key: requestKey, error: '返回的历史版本与来源记录不一致，请重试并核对来源。' });
          return;
        }
        setSnapshot({ key: requestKey, version });
      })
      .catch(error => { if (active) setSnapshot({ key: requestKey, error: sourceVersionError(error) }); });
    return () => { active = false; };
  }, [noteId, noteVersionId, onGetVersion, requestKey]);

  return <Dialog title="来源对照" size="md" isOpen onOpenChange={open => { if (!open) onClose(); }}
    description="对照知识陈述与来源绑定的历史版本，核对依据和适用性。">
    <DialogBody>
      <ExtractionDemoNotice />
      <div className={styles.columns}>
        <section className={styles.section} aria-label="待核对知识">
          <header className={styles.heading}><h3>知识陈述</h3><span>{knowledgeStatusLabel(item.reviewStatus)}</span></header>
          <h4 className={styles.title}>{item.title || '未命名知识'}</h4>
          <p className={styles.prose}>{item.canonicalStatement || '尚未填写核心陈述'}</p>
          {item.userExplanation ? <><h4 className={styles.label}>我的解释</h4><p className={styles.prose}>{item.userExplanation}</p></> : null}
        </section>
        <section className={styles.section} aria-label="保存的来源">
          <header className={styles.heading}><h3>来源依据</h3></header>
          <div className={styles.statuses} aria-label="来源状态">
            <span>{evidenceHealthLabel(evidence.status)}</span>
            <span>{evidenceApplicabilityLabel(evidence.applicabilityStatus)}</span>
            {evidence.sourceAnnotationRemoved ? <span>原标注已移除</span> : null}
          </div>
          {evidence.headingPath?.length ? <p className={styles.path}>{evidence.headingPath.join(' / ')}</p> : null}
          <h4 className={styles.label}>保存的摘录</h4>
          <blockquote className={styles.quote}>{evidence.quoteText || '该来源没有文字摘录'}</blockquote>
          {evidence.status !== 'valid' || evidence.applicabilityStatus === 'withdrawn' || evidence.applicabilityStatus === 'needsReview' ?
            <p className={styles.hint}>历史内容用于核对依据，来源的健康状态与适用性需要单独核对。</p> : null}
        </section>
      </div>
      <section className={styles.snapshot} aria-label="绑定的历史版本">
        <header className={styles.heading}><h3>绑定的历史版本</h3></header>
        {noteVersionId ? <p className={styles.versionId}>版本 ID：{noteVersionId}</p> : null}
        {!canLoadVersion ? <p className={styles.hint}>{evidence.sourceType === 'manual' ? '手动来源未绑定笔记历史版本，可核对上方保存的摘录。' : '这条来源未关联完整的笔记版本信息，可核对上方保存的摘录。'}</p> :
          !current ? <p role="status" className={styles.hint}>正在加载来源的历史版本…</p> :
          current.error ? <div className={styles.failure}><p role="alert">{current.error}</p><Button variant="ghost" onPress={() => setRetry(value => value + 1)}>重试历史版本</Button></div> :
          current.version ? <>
            <p className={styles.hint}>保存于 <time dateTime={current.version.createdAt}>{new Date(current.version.createdAt).toLocaleString('zh-CN')}</time> · {current.version.content.length.toLocaleString('zh-CN')} 字符</p>
            <pre className={styles.prose} aria-label="历史版本正文">{current.version.content || '（空白版本）'}</pre>
          </> : null}
      </section>
    </DialogBody>
    <DialogFooter>
      <DialogClose variant="ghost">关闭</DialogClose>
      {noteId ? <Button onPress={() => { onClose(); onOpenNote(noteId); }}>打开当前笔记</Button> : null}
    </DialogFooter>
  </Dialog>;
}
