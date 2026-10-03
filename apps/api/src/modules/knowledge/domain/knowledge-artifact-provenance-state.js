import { createAppError } from '../../../errors/app-error.js';
import { createLegacyKnowledgeArtifactProvenance, validateKnowledgeArtifactProvenance,
  resolveKnowledgeArtifactProvenanceSource } from './knowledge-artifact-provenance-contract.js';

export function migrateLegacyKnowledgeArtifactProvenance(state) {
  state.knowledgeArtifactProvenance ??= [];
  const present = new Set(state.knowledgeArtifactProvenance.map(record => validateKnowledgeArtifactProvenance(record).artifactId));
  for (const item of state.knowledgeItems) {
    if (item.sourceMode === 'ai' && !present.has(item.id)) {
      state.knowledgeArtifactProvenance.push(createLegacyKnowledgeArtifactProvenance(item.id));
    }
  }
  return state;
}

export function validateKnowledgeArtifactProvenanceRelations(state) {
  const index = collection => new Map((state[collection] ?? []).map(item => [item.id, item]));
  const items = index('knowledgeItems'), evidence = index('knowledgeEvidence'), notes = index('notes'), versions = index('noteVersions');
  const covered = new Set();
  for (const input of state.knowledgeArtifactProvenance ?? []) {
    const record = validateKnowledgeArtifactProvenance(input);
    const item = items.get(record.artifactId);
    if (!item || covered.has(record.artifactId)) throw createAppError('KNOWLEDGE_ARTIFACT_PROVENANCE_INVALID', '来源摘要必须独占属于现存知识。', 422);
    covered.add(record.artifactId);
    for (const source of record.sources ?? []) {
      const link = evidence.get(source.evidenceId);
      resolveKnowledgeArtifactProvenanceSource({ record, source, evidence: link,
        noteVersion: versions.get(link?.noteVersionId), note: notes.get(source.noteId), knowledgeItem: item });
      const original = versions.get(source.originNoteVersionId);
      if (original && (original.noteId !== source.noteId || original.contentHash !== source.contentHash)) {
        throw createAppError('KNOWLEDGE_ARTIFACT_PROVENANCE_SOURCE_MISMATCH', '原始来源版本身份不一致。', 422);
      }
    }
  }
  if ([...items.values()].some(item => item.sourceMode === 'ai' && !covered.has(item.id))) {
    throw createAppError('KNOWLEDGE_ARTIFACT_PROVENANCE_REQUIRED', 'AI 知识缺少明确的来源记录。', 422);
  }
  return state;
}

/** 旧快照不得将当前仍在的 recorded 降为缺失或 legacy。 */
export function assertNoKnowledgeArtifactProvenanceDowngrade(previous, next) {
  const nextItems = new Set((next.knowledgeItems ?? []).map(item => item.id));
  const nextRecords = new Map((next.knowledgeArtifactProvenance ?? []).map(record => [record.artifactId, record]));
  for (const record of previous.knowledgeArtifactProvenance ?? []) {
    if (record.state !== 'recorded' || !nextItems.has(record.artifactId)) continue;
    const replacement = nextRecords.get(record.artifactId);
    if (replacement?.provenanceHash !== record.provenanceHash) {
      throw createAppError('KNOWLEDGE_ARTIFACT_PROVENANCE_CONFLICT', '导入不能覆盖或降级已保存的来源事实。', 409);
    }
  }
}
