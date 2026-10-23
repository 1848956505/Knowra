import { createAppError } from '../../../errors/app-error.js';

import type { KnowledgeEvidence } from '../domain/knowledge-evidence.ts';

/** 本地历史记录只保证标识与知识归属；其余字段不假定已经过领域构造器规范化。 */
export interface KnowledgeEvidenceRecord {
  id: string;
  knowledgeItemId: string;
  sourceType?: KnowledgeEvidence['sourceType'] | null;
  status?: KnowledgeEvidence['status'] | null;
  relationType?: KnowledgeEvidence['relationType'] | null;
  applicabilityStatus?: KnowledgeEvidence['applicabilityStatus'] | null;
  noteId?: string | null;
  noteVersionId?: string | null;
  annotationId?: string | null;
  sourceId?: unknown;
  quoteText?: unknown;
  headingPath?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface KnowledgeEvidenceListOptions {
  knowledgeItemId?: string | null;
  noteId?: string | null;
  noteVersionId?: string | null;
  annotationId?: string | null;
}

/** 同步本地仓库；返回原记录引用，不负责异步持久化或回滚。 */
export interface KnowledgeEvidenceRepository {
  create(evidence: KnowledgeEvidenceRecord): KnowledgeEvidenceRecord;
  save(evidence: KnowledgeEvidenceRecord): KnowledgeEvidenceRecord;
  findById(id: string | null | undefined): KnowledgeEvidenceRecord | null;
  deleteByKnowledgeItemId(knowledgeItemId: string | null | undefined): KnowledgeEvidenceRecord[];
  list(options?: KnowledgeEvidenceListOptions): KnowledgeEvidenceRecord[];
  markByNoteId(noteId: string | null | undefined, status: KnowledgeEvidence['status']): KnowledgeEvidenceRecord[];
  markByAnnotationId(
    annotationId: string | null | undefined,
    status: KnowledgeEvidence['status']
  ): KnowledgeEvidenceRecord[];
  markByNoteVersionId(
    noteVersionId: string | null | undefined,
    status: KnowledgeEvidence['status'],
    sourceType?: KnowledgeEvidence['sourceType'] | '' | null
  ): KnowledgeEvidenceRecord[];
  markByNoteVersionIds(
    noteVersionIds: readonly string[],
    status: KnowledgeEvidence['status'],
    sourceType?: KnowledgeEvidence['sourceType'] | '' | null
  ): KnowledgeEvidenceRecord[];
}

export interface KnowledgeEvidenceRepositoryOptions {
  /** 保留调用方数组引用；省略或 null 时使用新数组。 */
  records?: KnowledgeEvidenceRecord[] | null;
  /** 同步变更钩子；每次读取当前回调，抛错不在本仓库内回滚。 */
  onChange?: ((records: KnowledgeEvidenceRecord[]) => void) | null;
}

export function createInMemoryKnowledgeEvidenceRepository(
  options: KnowledgeEvidenceRepositoryOptions = {}
): KnowledgeEvidenceRepository {
  const records = options.records ?? [];
  const persist = () => options.onChange?.(records);
  function updateStatus(predicate: (record: KnowledgeEvidenceRecord) => boolean, status: KnowledgeEvidence['status']) {
    const changed = [];
    for (const record of records) {
      if (!predicate(record) || record.status === status) continue;
      if (status === 'stale' && record.status === 'invalid') continue;
      record.status = status;
      record.updatedAt = new Date().toISOString();
      changed.push(record);
    }
    if (changed.length) persist();
    return changed;
  }
  return {
    create(evidence) {
      if (records.some(record => record.id === evidence.id)) {
        throw createAppError(
          'KNOWLEDGE_EVIDENCE_ID_CONFLICT',
          'KnowledgeEvidence with the same id already exists',
          409
        );
      }
      records.push(evidence);
      persist();
      return evidence;
    },
    save(evidence) {
      const index = records.findIndex(record => record.id === evidence.id);
      if (index < 0) records.push(evidence);
      else records[index] = evidence;
      persist();
      return evidence;
    },
    findById(id) {
      return records.find(item => item.id === id) ?? null;
    },
    deleteByKnowledgeItemId(knowledgeItemId) {
      const deleted = records.filter(item => item.knowledgeItemId === knowledgeItemId);
      for (const record of deleted) records.splice(records.indexOf(record), 1);
      if (deleted.length) persist();
      return deleted;
    },
    list({ knowledgeItemId, noteId, noteVersionId, annotationId } = {}) {
      return records.filter(
        item =>
          (!knowledgeItemId || item.knowledgeItemId === knowledgeItemId) &&
          (!noteId || item.noteId === noteId) &&
          (!noteVersionId || item.noteVersionId === noteVersionId) &&
          (!annotationId || item.annotationId === annotationId)
      );
    },
    markByNoteId(noteId, status) {
      return updateStatus(item => item.noteId === noteId, status);
    },
    markByAnnotationId(annotationId, status) {
      return updateStatus(item => item.annotationId === annotationId, status);
    },
    markByNoteVersionId(noteVersionId, status, sourceType = null) {
      return updateStatus(
        item => item.noteVersionId === noteVersionId && (!sourceType || item.sourceType === sourceType),
        status
      );
    },
    markByNoteVersionIds(noteVersionIds, status, sourceType = null) {
      const ids = new Set<string | null | undefined>(noteVersionIds);
      return updateStatus(
        item => ids.has(item.noteVersionId) && (!sourceType || item.sourceType === sourceType),
        status
      );
    }
  };
}
