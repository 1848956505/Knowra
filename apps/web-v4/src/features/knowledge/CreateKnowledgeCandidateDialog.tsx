import { useState } from 'react';
import type { Annotation, CreateKnowledgeCandidateInput, KnowledgeEvidence, KnowledgeItem } from '@study-accelerator/web-core';
import { KnowledgeItemDialog } from './KnowledgeItemDialog';
import styles from './KnowledgeWorkspaceView.module.css';

export interface CreateKnowledgeCandidateDialogProps {
  source?: Annotation;
  canWrite: boolean;
  readOnlyReason?: string;
  onClose(): void;
  onCreate(input: CreateKnowledgeCandidateInput): Promise<{ item: KnowledgeItem; evidence: KnowledgeEvidence[] }>;
  onCreated?(item: KnowledgeItem): void;
}

export function CreateKnowledgeCandidateDialog({ source, canWrite, readOnlyReason, onClose, onCreate, onCreated }: CreateKnowledgeCandidateDialogProps) {
  const [candidateId] = useState(() => `knowledge-${crypto.randomUUID()}`);
  return <KnowledgeItemDialog key={source?.id ?? 'manual'} title={source ? '从标注创建知识候选' : '新建知识候选'}
    initialValue={source ? { title: source.headingPath.at(-1) ?? '', canonicalStatement: source.quoteText, userExplanation: source.comment ?? '' } : undefined}
    canWrite={canWrite} readOnlyReason={readOnlyReason} onClose={onClose}
    onSubmit={async value => {
      const result = await onCreate({ ...value, id: candidateId, sourceMode: source ? 'annotation' : 'manual',
        ...(source ? { evidence: [{ sourceType: 'annotation', annotationId: source.id,
          ...(source.noteVersionId ? { noteVersionId: source.noteVersionId } : {}),
          ...(source.revision !== undefined ? { expectedAnnotationRevision: source.revision } : {}) }] } : {}) });
      return result.item;
    }} onSaved={item => { if (item) onCreated?.(item); }}>
    {source ? <section className={styles.sourcePreview} aria-label="来源标注">
      <strong>来源标注</strong>{source.headingPath.length > 0 ? <p>{source.headingPath.join(' / ')}</p> : null}
      <blockquote>{source.quoteText}</blockquote>
      <p className={styles.hint}>保存后保留来源快照。候选陈述可以重新组织，来源摘录保持原文。</p>
    </section> : null}
  </KnowledgeItemDialog>;
}
